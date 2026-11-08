import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// These pages are accessible without login
const PUBLIC_PATHS = ["/", "/login", "/forgot-password", "/reset-password", "/auth/callback", "/auth/signout", "/403"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response; // env missing: the page itself will show a readable error

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // getUser() verifies the token with Supabase (more secure than getSession)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.includes(path);

  if (!user && !isPublic) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.search = "";
    if (path !== "/dashboard") redirect.searchParams.set("next", path);
    const res = NextResponse.redirect(redirect);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2)$).*)"],
};
