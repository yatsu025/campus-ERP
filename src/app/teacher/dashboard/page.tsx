import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EXAM_LABEL, EXAM_TYPES, type ExamType } from "@/lib/constants";
import { allowedSubjects } from "@/lib/scope";
import { fmtDateTime } from "@/lib/utils";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader, Stat, TableWrap } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Teacher dashboard" };

export default async function TeacherDashboard() {
  const user = await requireRole("teacher");
  const supabase = await createClient();
  const subjects = await allowedSubjects(user);
  const ids = subjects.map((s) => s.id);

  const [{ data: batches }, { data: uploads }, { data: corrections }] = await Promise.all([
    ids.length ? supabase.from("marks_batches").select("subject_id,exam_type,total,published").in("subject_id", ids) : Promise.resolve({ data: [] }),
    supabase.from("upload_logs").select("id,file_name,status,rows_ok,rows_failed,created_at,meta").eq("type", "marks").order("created_at", { ascending: false }).limit(6),
    supabase.from("marks_corrections").select("id,status").eq("requested_by", user.id),
  ]);
  const b = new Map((batches ?? []).map((x) => [`${x.subject_id}|${x.exam_type}`, x]));
  const pending = subjects.length * EXAM_TYPES.length - (batches?.length ?? 0);
  const waitingPublish = (batches ?? []).filter((x) => x.published < x.total).length;
  const pendingCorr = (corrections ?? []).filter((c) => c.status === "pending").length;

  return (
    <>
      <PageHeader kicker={user.departmentName ?? "Teacher"} title={`Hello, ${user.fullName.split(" ")[0]}`} description="An overview of your subjects and marks." actions={<ButtonLink href="/teacher/marks/upload" variant="accent">Upload marks</ButtonLink>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="My subjects" value={subjects.length} tone="navy" />
        <Stat label="Pending uploads" value={Math.max(0, pending)} tone={pending > 0 ? "warn" : "ok"} hint="Subject x exam combinations where marks are not entered" href="/teacher/marks/upload" />
        <Stat label="Awaiting publish" value={waitingPublish} tone="crimson" hint="With the HOD" />
        <Stat label="Pending corrections" value={pendingCorr} tone="navy" href="/teacher/marks/history" />
      </div>

      <Card className="mt-6">
        <CardHeader title="My subjects" />
        {subjects.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th className="th">Subject</th>
                <th className="th">Course</th>
                {EXAM_TYPES.map((e) => (
                  <th key={e} className="th">{e}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.id}>
                  <td className="td"><p className="font-semibold text-navy-900">{s.name}</p><p className="text-xs text-muted">{s.code}</p></td>
                  <td className="td">{s.courseCode} · Sem {s.semester}</td>
                  {EXAM_TYPES.map((e) => {
                    const x = b.get(`${s.id}|${e}`);
                    return (
                      <td key={e} className="td">
                        {!x ? <Badge>Pending</Badge> : x.published === x.total ? <Badge tone="ok">Published</Badge> : <Badge tone="warn">Uploaded</Badge>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <EmptyState title="No subject assigned yet" text="Ask the Admin to assign subjects." />
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Recent uploads" action={<ButtonLink href="/teacher/marks/history" variant="ghost" size="sm">History</ButtonLink>} />
        {uploads?.length ? (
          <ul className="divide-y divide-line">
            {uploads.map((u) => {
              const m = u.meta as { subject_code?: string; exam_type?: ExamType };
              return (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span><b className="text-navy-900">{m.subject_code}</b> {m.exam_type && EXAM_LABEL[m.exam_type]} · {u.file_name}</span>
                  <span className="flex items-center gap-2 text-xs text-muted">{fmtDateTime(u.created_at)} <Badge tone={u.status === "confirmed" ? "ok" : "mute"}>{u.status}</Badge></span>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="No uploads yet" />
        )}
      </Card>
    </>
  );
}
