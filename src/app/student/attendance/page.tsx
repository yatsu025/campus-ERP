import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ATTENDANCE_THRESHOLD } from "@/lib/constants";
import { classesToReach } from "@/lib/data";
import { cn, isUuid, strParam, toNum } from "@/lib/utils";
import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader, PercentBadge, TableWrap } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "My attendance" };

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthParam(v: string): { y: number; m: number } {
  const match = v.match(/^(\d{4})-(\d{2})$/);
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  if (match && Number(match[2]) >= 1 && Number(match[2]) <= 12 && Number(match[1]) >= 2000 && Number(match[1]) <= 2100) return { y: Number(match[1]), m: Number(match[2]) };
  return { y: now.getFullYear(), m: now.getMonth() + 1 };
}
const mk = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

export default async function StudentAttendance({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole("student");
  const sp = await searchParams;
  const supabase = await createClient();
  const sid = user.student!.id;

  const { y, m } = monthParam(strParam(sp.m, 7));
  const subjectParam = strParam(sp.subject, 40);
  const subjectFilter = isUuid(subjectParam) ? subjectParam : "";

  const first = `${mk(y, m)}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = `${mk(y, m)}-${String(lastDay).padStart(2, "0")}`;

  const summaryRes = await supabase.from("attendance_summary").select("subject_id,total,present,percentage").eq("student_id", sid);
  const summary = summaryRes.data ?? [];
  const ids = summary.map((s) => s.subject_id);
  const { data: subjects } = ids.length ? await supabase.from("subjects").select("id,code,name").in("id", ids) : { data: [] };
  const subj = new Map((subjects ?? []).map((s) => [s.id, s]));

  let q = supabase.from("attendance").select("date,status,subject_id").eq("student_id", sid).gte("date", first).lte("date", last).order("date");
  if (subjectFilter) q = q.eq("subject_id", subjectFilter);
  const { data: month } = await q;

  const byDate = new Map<string, { p: number; a: number }>();
  for (const r of month ?? []) {
    const e = byDate.get(r.date) ?? { p: 0, a: 0 };
    if (r.status === "present") e.p++;
    else e.a++;
    byDate.set(r.date, e);
  }

  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // Monday first
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: lastDay }, (_, i) => i + 1)];
  const prev = m === 1 ? mk(y - 1, 12) : mk(y, m - 1);
  const next = m === 12 ? mk(y + 1, 1) : mk(y, m + 1);
  const monthName = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const q2 = (mm: string) => `?m=${mm}${subjectFilter ? `&subject=${subjectFilter}` : ""}`;

  const lowList = summary.filter((s) => toNum(s.percentage) < ATTENDANCE_THRESHOLD);

  return (
    <>
      <PageHeader kicker="Attendance" title="My attendance" description="Subject-wise percentage and day-by-day present / absent. Subjects below 75% are shown in red." />

      {lowList.length > 0 && (
        <div className="mb-6">
          <Alert tone="bad" title={`${lowList.length} subjects have attendance below 75%`}>
            {lowList.map((s) => subj.get(s.subject_id)?.name).filter(Boolean).join(", ")}
          </Alert>
        </div>
      )}

      <Card>
        <CardHeader title="Subject-wise summary" />
        {summary.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th className="th">Subject</th>
                <th className="th">Classes</th>
                <th className="th">Present</th>
                <th className="th">Absent</th>
                <th className="th min-w-40">Progress</th>
                <th className="th">%</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => {
                const sub = subj.get(s.subject_id);
                const pct = toNum(s.percentage);
                const need = classesToReach(s.total, s.present);
                return (
                  <tr key={s.subject_id}>
                    <td className="td">
                      <p className="font-semibold text-navy-900">{sub?.name}</p>
                      <p className="text-xs text-muted">{sub?.code}</p>
                    </td>
                    <td className="td">{s.total}</td>
                    <td className="td text-ok">{s.present}</td>
                    <td className="td text-bad">{s.total - s.present}</td>
                    <td className="td">
                      <div className="relative h-2 w-full overflow-hidden rounded-full bg-paper-2">
                        <div className={cn("h-full rounded-full", pct >= ATTENDANCE_THRESHOLD ? "bg-ok" : "bg-bad")} style={{ width: `${Math.min(100, pct)}%` }} />
                        <span className="absolute inset-y-0 w-px bg-navy-900/50" style={{ left: `${ATTENDANCE_THRESHOLD}%` }} />
                      </div>
                    </td>
                    <td className="td">
                      <PercentBadge value={pct} />
                    </td>
                    <td className="td text-xs">
                      {pct >= ATTENDANCE_THRESHOLD ? <Badge tone="ok">Safe</Badge> : <span className="text-bad">Attend {need} consecutive classes</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        ) : (
          <EmptyState title="Attendance has not been uploaded yet" text="Subject-wise attendance will appear here once the HOD uploads the sheet." />
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader
          title={monthName}
          subtitle="Green = all present · Red = some classes absent"
          action={
            <div className="flex items-center gap-2">
              <Link href={q2(prev)} className="btn btn-ghost btn-sm" aria-label="Previous month">
                <ChevronLeft className="size-4" />
              </Link>
              <Link href={q2(next)} className="btn btn-ghost btn-sm" aria-label="Next month">
                <ChevronRight className="size-4" />
              </Link>
            </div>
          }
        />
        <div className="flex flex-wrap gap-2 border-b border-line px-5 py-3">
          <Link href={`?m=${mk(y, m)}`} className={cn("badge", !subjectFilter ? "badge-info" : "badge-mute")}>
            All subjects
          </Link>
          {summary.map((s) => (
            <Link key={s.subject_id} href={`?m=${mk(y, m)}&subject=${s.subject_id}`} className={cn("badge", subjectFilter === s.subject_id ? "badge-info" : "badge-mute")}>
              {subj.get(s.subject_id)?.code}
            </Link>
          ))}
        </div>
        <div className="p-4 sm:p-5">
          <div className="grid grid-cols-7 gap-1.5 text-center text-[0.68rem] font-bold uppercase tracking-wider text-muted">
            {DOW.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1.5">
            {cells.map((day, i) => {
              if (!day) return <div key={`e${i}`} />;
              const date = `${mk(y, m)}-${String(day).padStart(2, "0")}`;
              const e = byDate.get(date);
              return (
                <div
                  key={date}
                  title={e ? `${e.p} present, ${e.a} absent` : "No records"}
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center rounded-lg border text-sm font-semibold",
                    !e && "border-transparent bg-paper-2/60 text-muted",
                    e && e.a === 0 && "border-[#bfe3d0] bg-[#e4f4ec] text-ok",
                    e && e.a > 0 && "border-[#f0c3bf] bg-[#fbe8e6] text-bad",
                  )}
                >
                  {day}
                  {e && (
                    <span className="text-[0.6rem] font-medium opacity-80">
                      {e.p}P {e.a > 0 ? `${e.a}A` : ""}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </>
  );
}
