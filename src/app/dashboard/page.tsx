import { redirect } from "next/navigation";
import { getSessionUser, homeFor } from "@/lib/auth";

/** After login, redirects to the right dashboard based on the user's role. */
export default async function DashboardRedirect() {
  const user = await getSessionUser();
  if (!user) redirect("/auth/signout?reason=session");
  if (user.mustChangePassword) redirect("/change-password");
  redirect(homeFor(user.role));
}
