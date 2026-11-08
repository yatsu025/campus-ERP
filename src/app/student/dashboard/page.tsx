import type { Metadata } from "next";
import { ArrowRight, FileCheck2 } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ATTENDANCE_THRESHOLD, EXAM_LABEL, NOC_STATUS_LABEL, type ExamType } from "@/lib/constants";
import { fmtDate, timeAgo, toNum } from "@/lib/utils";
import { SubjectBars } from "@/components/charts/charts";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader, Stat, TableWrap } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Student dashboard" };

const nocTone = { draft: "mute", applied: "info", under_review: "warn", approved: "ok", rejected: "bad" } as const;

export default async function StudentDashboard() {
  const user = await requireRole("student");
  const supabase = await createClient();
  const sid = user.student!.id;

  const [summaryRes, marksRes, nocRes, notesRes, marksCount] = await Promise.all([
    supabase.from("attendance_summary").select("subject_id,total,present,percentage").eq("student_id", sid),
    supabase
      .from("marks")
      .select("exam_type,marks,max_marks,published_at,subjects(code,name)")
      .eq("student_id", sid)
      .order("published_at", { ascending: false })
      .limit(5),
    supabase.from("noc_requests").select("id,status,company_name,risk_level,created_at").eq("student_id", sid).order("created_at", { ascending: false }).limit(1),
    supabase.from("notifications").select("id,title,message,link,created_at,is_read").order("created_at", { ascending: false }).limit(5),
    supabase.from("marks").select("id", { count: "exact", head: true }).eq("student_id", sid),
  ]);

  const summary = summaryRes.data ?? [];
  const subjectIds = summary.map((s) => s.subject_id);
  const { data: subjects } = subjectIds.length ? await supabase.from("subjects").select("id,code,name").in("id", subjectIds) : { data: [] };
  const subjName = new Map((subjects ?? []).map((s) => [s.id, s]));

  const totals = summary.reduce((a, s) => ({ t: a.t + s.total, p: a.p + s.present }), { t: 0, p: 0 });
  const overall = totals.t ? (totals.p / totals.t) * 100 : null;
  const low = summary.filter((s) => toNum(s.percentage) < ATTENDANCE_THRESHOLD).length;
  const chart = summary
    .map((s) => ({ name: subjName.get(s.subject_id)?.code ?? "?", value: toNum(s.percentage) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const noc = nocRes.data?.[0];
  const marks = marksRes.data ?? [];
  const notes = notesRes.data ?? [];

  return (
    <>
      <PageHeader
        kicker={`Roll No. ${user.student!.rollNo}`}
        title={`Hello, ${user.fullName.split(" ")[0]}`}
        description={`${user.student!.courseName} · Semester ${user.student!.semester}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Overall attendance"
          value={overall === null ? "-" : `${overall.toFixed(1)}%`}
          tone={overall === null ? "navy" : overall >= ATTENDANCE_THRESHOLD ? "ok" : "bad"}
          hint={overall === null ? "Attendance has not been uploaded yet" : `${totals.p} present / ${totals.t} classes`}
          href="/student/attendance"
        />
        <Stat label="Subjects below 75%" value={low} tone={low ? "bad" : "ok"} hint={low ? "Pay attention to these subjects" : "Everything is fine"} href="/student/attendance" />
        <Stat label="Published marks" value={marksCount.count ?? 0} tone="crimson" hint="Published subject-exam entries" href="/student/marks" />
        <Stat
          label="NOC status"
          value={noc ? NOC_STATUS_LABEL[noc.status as keyof typeof NOC_STATUS_LABEL] : "None"}
          tone={noc ? (noc.status === "approved" ? "ok" : noc.status === "rejected" ? "bad" : "navy") : "navy"}
          hint={noc ? noc.company_name : "No NOC request"}
          href={noc ? "/student/noc/status" : "/student/noc/apply"}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Subject-wise attendance" subtitle="Red line = 75% threshold" action={<ButtonLink href="/student/attendance" variant="ghost" size="sm">Details <ArrowRight className="size-3.5" /></ButtonLink>} />
          <div className="p-4">
            {chart.length ? <SubjectBars data={chart} /> : <EmptyState title="No attendance yet" text="Attendance will appear here as soon as the HOD uploads it." />}
          </div>
        </Card>

        <Card>
          <CardHeader title="Notifications" action={<ButtonLink href="/notifications" variant="ghost" size="sm">View all</ButtonLink>} />
          {notes.length ? (
            <ul className="divide-y divide-line">
              {notes.map((n) => (
                <li key={n.id} className="flex gap-3 px-5 py-3">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.is_read ? "bg-line" : "bg-crimson"}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-navy-900">{n.title}</p>
                    <p className="line-clamp-2 text-xs text-muted">{n.message}</p>
                    <p className="mt-0.5 text-[0.7rem] text-muted/80">{timeAgo(n.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="All quiet" text="No notifications." />
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Latest published marks" action={<ButtonLink href="/student/marks" variant="ghost" size="sm">All marks</ButtonLink>} />
        {marks.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th className="th">Subject</th>
                <th className="th">Exam</th>
                <th className="th">Marks</th>
                <th className="th">Published</th>
              </tr>
            </thead>
            <tbody>
              {marks.map((m, i) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const s: any = m.subjects;
                return (
                  <tr key={i}>
                    <td className="td">
                      <span className="font-semibold text-navy-900">{s?.name}</span> <span className="text-xs text-muted">{s?.code}</span>
                    </td>
                    <td className="td">{EXAM_LABEL[m.exam_type as ExamType]}</td>
                    <td className="td font-semibold">
                      {toNum(m.marks)} <span className="font-normal text-muted">/ {toNum(m.max_marks)}</span>
                    </td>
                    <td className="td text-muted">{fmtDate(m.published_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        ) : (
          <EmptyState title="No marks published yet" text="Marks will appear here once the HOD publishes them." />
        )}
      </Card>

      {noc && (
        <Card className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="flex items-center gap-3">
              <FileCheck2 className="size-8 text-crimson" strokeWidth={1.5} />
              <div>
                <p className="text-sm font-semibold text-navy-900">NOC: {noc.company_name}</p>
                <p className="text-xs text-muted">Applied {fmtDate(noc.created_at)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={nocTone[noc.status as keyof typeof nocTone]}>{NOC_STATUS_LABEL[noc.status as keyof typeof NOC_STATUS_LABEL]}</Badge>
              <ButtonLink href="/student/noc/status" variant="ghost" size="sm">
                Track <ArrowRight className="size-3.5" />
              </ButtonLink>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
