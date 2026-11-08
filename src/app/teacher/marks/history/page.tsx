import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EXAM_LABEL, EXAM_TYPES, type ExamType } from "@/lib/constants";
import { allowedSubjects, subjectLabel } from "@/lib/scope";
import { fmtDateTime, toNum } from "@/lib/utils";
import { requestCorrection } from "@/app/actions/marks";
import { ActionForm, Field, SubmitButton } from "@/components/ui/form";
import { Badge, Card, CardHeader, EmptyState, PageHeader, TableWrap } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Marks history" };

const tone = { confirmed: "ok", previewed: "warn", failed: "bad", discarded: "mute" } as const;
const cTone = { pending: "warn", approved: "ok", rejected: "bad" } as const;

export default async function TeacherMarksHistory() {
  const user = await requireRole("teacher");
  const supabase = await createClient();
  const subjects = await allowedSubjects(user);
  const [{ data: uploads }, { data: corr }] = await Promise.all([
    supabase.from("upload_logs").select("id,file_name,status,rows_ok,rows_failed,created_at,meta").eq("type", "marks").order("created_at", { ascending: false }).limit(30),
    supabase.from("marks_corrections").select("id,new_marks,reason,status,created_at,marks(marks,exam_type,subjects(code),students(univ_roll_no))").eq("requested_by", user.id).order("created_at", { ascending: false }).limit(20),
  ]);

  return (
    <>
      <PageHeader kicker="Sessional marks" title="Marks history" description="All your uploads. To change published marks, send a correction request to the HOD." />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Upload history" />
          {uploads?.length ? (
            <TableWrap>
              <thead><tr><th className="th">Date</th><th className="th">Subject</th><th className="th">File</th><th className="th">Rows</th><th className="th">Status</th></tr></thead>
              <tbody>
                {uploads.map((u) => {
                  const m = u.meta as { subject_code?: string; exam_type?: ExamType };
                  return (
                    <tr key={u.id}>
                      <td className="td text-muted">{fmtDateTime(u.created_at)}</td>
                      <td className="td"><b className="text-navy-900">{m.subject_code}</b> <span className="text-xs text-muted">{m.exam_type && EXAM_LABEL[m.exam_type]}</span></td>
                      <td className="td max-w-48 truncate">{u.file_name}</td>
                      <td className="td"><span className="text-ok">{u.rows_ok}</span> / <span className="text-bad">{u.rows_failed}</span></td>
                      <td className="td"><Badge tone={tone[u.status as keyof typeof tone]}>{u.status}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          ) : (
            <EmptyState title="No uploads yet" />
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Correction request" subtitle="Only for published marks" />
            <div className="p-5">
              <ActionForm action={requestCorrection} resetOnSuccess>
                <Field name="subject_id" as="select" label="Subject" required options={subjects.map((s) => ({ value: s.id, label: subjectLabel(s) }))} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field name="exam_type" as="select" label="Exam" required options={EXAM_TYPES.map((e) => ({ value: e, label: EXAM_LABEL[e] }))} />
                  <Field name="roll_no" label="Roll No." required />
                </div>
                <Field name="new_marks" label="Correct marks" inputMode="numeric" required />
                <Field name="reason" as="textarea" rows={3} label="Reason" required />
                <SubmitButton>Send to HOD</SubmitButton>
              </ActionForm>
            </div>
          </Card>
          <Card>
            <CardHeader title="My requests" />
            {corr?.length ? (
              <ul className="divide-y divide-line">
                {corr.map((c) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const m: any = c.marks;
                  return (
                    <li key={c.id} className="px-5 py-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-navy-900">{m?.students?.univ_roll_no} · {m?.subjects?.code} {m?.exam_type}</span>
                        <Badge tone={cTone[c.status as keyof typeof cTone]}>{c.status}</Badge>
                      </div>
                      <p className="text-xs text-muted">{toNum(m?.marks)} → {toNum(c.new_marks)} · {c.reason}</p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title="No requests" />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
