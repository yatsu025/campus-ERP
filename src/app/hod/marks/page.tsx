import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EXAM_LABEL, type ExamType } from "@/lib/constants";
import { allowedSubjects } from "@/lib/scope";
import { fmtDateTime, toNum } from "@/lib/utils";
import { decideCorrection, publishBatch, unpublishBatch } from "@/app/actions/marks";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader, TableWrap } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Marks management" };

export default async function HodMarks() {
  const user = await requireRole("hod");
  const supabase = await createClient();
  const subjects = await allowedSubjects(user);
  const sm = new Map(subjects.map((s) => [s.id, s]));

  const [{ data: batches }, { data: corr }] = await Promise.all([
    supabase.from("marks_batches").select("subject_id,exam_type,total,published,last_updated").order("last_updated", { ascending: false }),
    supabase.from("marks_corrections").select("id,new_marks,reason,created_at,marks(marks,exam_type,subject_id,students(univ_roll_no,name)),requested_by").eq("status", "pending").order("created_at"),
  ]);

  return (
    <>
      <PageHeader kicker="Sessional marks" title="Marks management" description="Marks are visible to students only after you publish them. Once published, marks are locked; changes can only be made through a correction request." actions={<ButtonLink href="/hod/marks/upload" variant="accent">Marks upload</ButtonLink>} />

      {!!corr?.length && (
        <Card className="mb-6 border-warn/40">
          <CardHeader title={`Correction requests (${corr.length})`} subtitle="Approving immediately updates the marks, and the previous version is kept in the history." />
          <ul className="divide-y divide-line">
            {corr.map((c) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const m: any = c.marks;
              const s = sm.get(m?.subject_id);
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-navy-900">{m?.students?.name} ({m?.students?.univ_roll_no}) · {s?.code} {m?.exam_type}</p>
                    <p className="text-muted"><b>{toNum(m?.marks)}</b> → <b className="text-navy-900">{toNum(c.new_marks)}</b> · {c.reason}</p>
                  </div>
                  <div className="flex gap-2">
                    <ActionForm action={decideCorrection} className="!space-y-0"><input type="hidden" name="correction_id" value={c.id} /><input type="hidden" name="decision" value="approved" /><SubmitButton size="sm">Approve</SubmitButton></ActionForm>
                    <ActionForm action={decideCorrection} className="!space-y-0"><input type="hidden" name="correction_id" value={c.id} /><input type="hidden" name="decision" value="rejected" /><SubmitButton size="sm" variant="danger">Reject</SubmitButton></ActionForm>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Uploaded batches" />
        {batches?.length ? (
          <TableWrap>
            <thead>
              <tr><th className="th">Subject</th><th className="th">Exam</th><th className="th">Students</th><th className="th">Status</th><th className="th">Last update</th><th className="th">Action</th></tr>
            </thead>
            <tbody>
              {batches.map((b) => {
                const s = sm.get(b.subject_id);
                if (!s) return null;
                const all = b.published === b.total;
                const none = b.published === 0;
                return (
                  <tr key={`${b.subject_id}${b.exam_type}`}>
                    <td className="td"><p className="font-semibold text-navy-900">{s.name}</p><p className="text-xs text-muted">{s.code} · {s.courseCode} Sem {s.semester}</p></td>
                    <td className="td">{EXAM_LABEL[b.exam_type as ExamType]}</td>
                    <td className="td">{b.total}</td>
                    <td className="td">{all ? <Badge tone="ok">Published & locked</Badge> : none ? <Badge tone="warn">Draft</Badge> : <Badge tone="info">{b.published}/{b.total} published</Badge>}</td>
                    <td className="td text-xs text-muted">{fmtDateTime(b.last_updated)}</td>
                    <td className="td">
                      <div className="flex gap-2">
                        {!all && (
                          <ActionForm action={publishBatch} className="!space-y-0"><input type="hidden" name="subject_id" value={b.subject_id} /><input type="hidden" name="exam_type" value={b.exam_type} /><SubmitButton size="sm" variant="accent">Publish</SubmitButton></ActionForm>
                        )}
                        {!none && (
                          <ActionForm action={unpublishBatch} className="!space-y-0"><input type="hidden" name="subject_id" value={b.subject_id} /><input type="hidden" name="exam_type" value={b.exam_type} /><SubmitButton size="sm" variant="ghost">Unpublish</SubmitButton></ActionForm>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        ) : (
          <EmptyState title="No marks uploaded yet" text="Once a teacher or you upload marks, the batches will appear here." />
        )}
      </Card>
    </>
  );
}
