import "server-only";

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Environment variable ${name} is not set. Check .env.local (or Vercel Project Settings > Environment Variables).`);
  }
  return v;
}

export const env = {
  get supabaseUrl() {
    return need("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return need("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get serviceRoleKey() {
    return need("SUPABASE_SERVICE_ROLE_KEY");
  },
  get siteUrl() {
    const raw = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    return raw.replace(/\/+$/, "");
  },
  get resendKey() {
    return process.env.RESEND_API_KEY || "";
  },
  get emailFrom() {
    return process.env.EMAIL_FROM || "Campus ERP <no-reply@example.com>";
  },
};
