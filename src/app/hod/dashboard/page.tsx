import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ATTENDANCE_THRESHOLD } from "@/lib/constants";
import { pageAll } from "@/lib/db";
import { fmtDateTime, toNum } from "@/lib/utils";
import { BandBars } from "@/components/charts/charts";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader, Stat, TableWrap } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "HOD dashboard" };

const tone = { confirmed: "ok", previewed: "warn", failed: "bad", discarded: "mute" } as const;

export default async function HodDashboard() {
  const user = await requireRole("hod");
  const supabase = await createClient();

  const [nocPending, unpublished, corrections, uploads, summary, students] = await Promise.all([
    supabase.from("noc_requests").select("id", { count: "exact", head: true }).in("status", ["applied", "under_review"]),
    supabase.from("marks_batches").select("subject_id,exam_type,total,published"),
    supabase.from("marks_corrections").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("upload_logs").select("id,type,file_name,status,rows_ok,rows_failed,created_at").order("created_at", { ascending: false }).limit(6),
    pageAll<{ student_id: string; total: number; present: number }>((a, b) => supabase.from("attendance_summary").select("student_id,total,present").range(a, b)),
    supabase.from("students").select("id", { count: "exact", head: true }),
  ]);

  // Each student's overall % (across all subjects)
  const per = new Map<string, { t: number; p: number }>();
  for (const s of summary) {
    const e = per.get(s.student_id) ?? { t: 0, p: 0 };
    e.t += s.total;
    e.p += s.present;
    per.set(s.student_id, e);
  }
  const pcts = [...per.values()].map((e) => (e.t ? (e.p / e.t) * 100 : 0));
  const bands = [
    { name: "< 60%", value: pcts.filter((p) => p < 60).length, tone: "bad" as const },
    { name: "60-75%", value: pcts.filter((p) => p >= 60 && p < ATTENDANCE_THRESHOLD).length, tone: "warn" as const },
    { name: "75-90%", value: pcts.filter((p) => p >= ATTENDANCE_THRESHOLD && p < 90).length, tone: "ok" as const },
    { name: "90%+", value: pcts.filter((p) => p >= 90).length, tone: "ok" as const },
  ];
  const low = pcts.filter((p) => p < ATTENDANCE_THRESHOLD).length;
  const toPublish = (unpublished.data ?? []).filter((b) => toNum(b.published) < toNum(b.total)).length;

  return (
    <>
      <PageHeader kicker={user.departmentName ?? "HOD"} title={`Welcome, ${user.fullName.split(" ")[0]}`} description="A snapshot of your department." actions={<ButtonLink href="/hod/attendance/upload" variant="accent">Attendance upload</ButtonLink>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Pending NOC" value={nocPending.count ?? 0} tone="crimson" href="/hod/noc/requests" hint="Applied + under review" />
        <Stat label="Low attendance" value={low} tone={low ? "bad" : "ok"} href="/hod/attendance/reports" hint={`${ATTENDANCE_THRESHOLD}% or below (overall)`} />
        <Stat label="Pending publish" value={toPublish} tone="warn" href="/hod/marks" hint="Subject x exam batches" />
        <Stat label="Corrections" value={corrections.count ?? 0} tone="navy" href="/hod/marks" hint="Awaiting approval" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader title="Attendance distribution" subtitle={`Attendance available for ${pcts.length} of ${students.count ?? 0} students`} />
          <div className="p-4">{pcts.length ? <BandBars data={bands} /> : <EmptyState title="No attendance uploaded yet" />}</div>
        </Card>
        <Card>
          <CardHeader title="Recent uploads" />
          {uploads.data?.length ? (
            <TableWrap>
              <thead><tr><th className="th">Type</th><th className="th">File</th><th className="th">OK / Failed</th><th className="th">Status</th><th className="th">When</th></tr></thead>
              <tbody>
                {uploads.data.map((u) => (
                  <tr key={u.id}>
                    <td className="td capitalize">{u.type}</td>
                    <td className="td max-w-40 truncate">{u.file_name}</td>
                    <td className="td"><span className="text-ok">{u.rows_ok}</span> / <span className="text-bad">{u.rows_failed}</span></td>
                    <td className="td"><Badge tone={tone[u.status as keyof typeof tone]}>{u.status}</Badge></td>
                    <td className="td text-xs text-muted">{fmtDateTime(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          ) : (
            <EmptyState title="No uploads" />
          )}
        </Card>
      </div>
    </>
  );
}
