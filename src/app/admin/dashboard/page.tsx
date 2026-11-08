import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import { TrendArea } from "@/components/charts/charts";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Admin dashboard" };

export default async function AdminDashboard() {
  const user = await requireRole("admin");
  const supabase = await createClient();
  const since = new Date(Date.now() - 56 * 86400000).toISOString();
  const day = new Date(Date.now() - 86400000).toISOString();
  const head = { count: "exact", head: true } as const;

  const [students, teachers, hods, inactive, uploads, audit24, nocOpen, recent] = await Promise.all([
    supabase.from("users").select("id", head).eq("role", "student").eq("is_active", true),
    supabase.from("users").select("id", head).eq("role", "teacher").eq("is_active", true),
    supabase.from("users").select("id", head).eq("role", "hod").eq("is_active", true),
    supabase.from("users").select("id", head).eq("is_active", false),
    supabase.from("upload_logs").select("created_at").eq("status", "confirmed").gte("created_at", since).limit(5000),
    supabase.from("audit_logs").select("id", head).gte("created_at", day),
    supabase.from("noc_requests").select("id", head).in("status", ["applied", "under_review"]),
    supabase.from("audit_logs").select("id,action,created_at,users(full_name)").order("created_at", { ascending: false }).limit(8),
  ]);

  // Uploads over the last 8 weeks
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = Date.now() - (7 - i) * 7 * 86400000;
    return { start, name: new Date(start).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" }), value: 0 };
  });
  for (const u of uploads.data ?? []) {
    const t = new Date(u.created_at).getTime();
    for (let i = weeks.length - 1; i >= 0; i--) {
      if (t >= weeks[i]!.start) {
        weeks[i]!.value++;
        break;
      }
    }
  }

  return (
    <>
      <PageHeader kicker="Administration" title={`Welcome, ${user.fullName.split(" ")[0]}`} description="Overview of the entire system." actions={<ButtonLink href="/admin/users" variant="accent">Manage users</ButtonLink>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Students" value={students.count ?? 0} tone="navy" href="/admin/users?role=student" />
        <Stat label="Teachers" value={teachers.count ?? 0} tone="crimson" href="/admin/users?role=teacher" />
        <Stat label="HODs" value={hods.count ?? 0} tone="navy" href="/admin/users?role=hod" />
        <Stat label="Disabled accounts" value={inactive.count ?? 0} tone={inactive.count ? "warn" : "ok"} />
        <Stat label="Pending NOC (all depts)" value={nocOpen.count ?? 0} tone="warn" />
        <Stat label="Audit events (24h)" value={audit24.count ?? 0} tone="navy" href="/admin/audit-logs" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader title="Uploads (last 8 weeks)" subtitle="Confirmed attendance, marks and user imports" />
          <div className="p-4"><TrendArea data={weeks.map((w) => ({ name: w.name, value: w.value }))} /></div>
        </Card>
        <Card>
          <CardHeader title="Recent activity" action={<ButtonLink href="/admin/audit-logs" variant="ghost" size="sm">All logs</ButtonLink>} />
          {recent.data?.length ? (
            <ul className="divide-y divide-line">
              {recent.data.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <span className="min-w-0 truncate"><Badge>{a.action}</Badge> <span className="text-xs text-muted">{(a.users as any)?.full_name ?? "system"}</span></span>
                  <span className="shrink-0 text-xs text-muted">{fmtDateTime(a.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No activity yet" />
          )}
        </Card>
      </div>
    </>
  );
}
