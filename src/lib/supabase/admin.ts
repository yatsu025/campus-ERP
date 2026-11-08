import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * SERVICE ROLE client: bypasses RLS.
 * Use it only in Server Actions / Route Handlers, AFTER the role + department check.
 * Because of the `server-only` import, it can never end up in the browser bundle.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cached: SupabaseClient<any, "public", any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function admin(): SupabaseClient<any, "public", any> {
  if (!cached) {
    cached = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return cached;
}
