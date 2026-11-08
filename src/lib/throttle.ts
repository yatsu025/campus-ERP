import "server-only";
import { headers } from "next/headers";
import { admin } from "@/lib/supabase/admin";

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

/** How many attempts has this identifier made in the last `windowMin` minutes? */
export async function attemptsInWindow(identifier: string, windowMin: number): Promise<number> {
  const since = new Date(Date.now() - windowMin * 60_000).toISOString();
  const { count } = await admin()
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("identifier", identifier)
    .gte("created_at", since);
  return count ?? 0;
}

export async function recordAttempt(identifier: string): Promise<void> {
  const ip = await clientIp();
  await admin().from("login_attempts").insert({ identifier, ip });
}

export async function clearAttempts(identifier: string): Promise<void> {
  await admin().from("login_attempts").delete().eq("identifier", identifier);
}
