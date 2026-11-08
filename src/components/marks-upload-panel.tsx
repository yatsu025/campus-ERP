import { Download } from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EXAM_LABEL, EXAM_TYPES, type ExamType } from "@/lib/constants";
import { allowedSubjects, subjectLabel } from "@/lib/scope";
import { isUuid, strParam } from "@/lib/utils";
import { confirmMarksUpload, previewMarksUpload } from "@/app/actions/marks";
import { ActionForm, Field, SubmitButton } from "@/components/ui/form";
import { Alert, Card, CardHeader, DownloadLink } from "@/components/ui/primitives";
import { UploadPreview } from "@/components/ui/upload-preview";

/** Marks upload flow for both Teacher and HOD: Step 1 select, Step 2 upload, Step 3 preview + confirm */
export async function MarksUploadPanel({ user, searchParams }: { user: SessionUser; searchParams: Record<string, string | string[] | undefined> }) {
  const subjects = await allowedSubjects(user);
  const subjectId = strParam(searchParams.subject, 40);
  const exam = strParam(searchParams.exam, 10) as ExamType;
  const uploadId = strParam(searchParams.upload, 40);
  const subject = isUuid(subjectId) ? subjects.find((s) => s.id === subjectId) : undefined;
  const examOk = (EXAM_TYPES as readonly string[]).includes(exam);
  const base = `/${user.role}/marks/upload`;

  if (isUuid(uploadId)) {
    const supabase = await createClient();
    const { data: log } = await supabase.from("upload_logs").select("id,file_name,rows_total,rows_ok,rows_failed,payload,status,meta").eq("id", uploadId).eq("type", "marks").maybeSingle();
    if (!log) return <Alert tone="bad">This upload was not found.</Alert>;
    const meta = log.meta as { subject_code: string; subject_name: string; exam_type: ExamType };
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">
          <b className="text-navy-900">{meta.subject_code}</b> {meta.subject_name} · {EXAM_LABEL[meta.exam_type]}
        </p>
        <UploadPreview
          log={log}
          confirmAction={confirmMarksUpload}
          backPath={base}
          columns={[
            { key: "roll", label: "Roll No." },
            { key: "name", label: "Student" },
            { key: "marks", label: "Marks" },
            { key: "max", label: "Max" },
            { key: "previous", label: "Previous" },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader title="Step 1: Select subject and exam" />
        <form method="get" className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-[0.8rem] font-semibold text-navy-900" htmlFor="subject">
              Subject
            </label>
            <select id="subject" name="subject" className="input" defaultValue={subject?.id ?? ""}>
              <option value="">Select…</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {subjectLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[0.8rem] font-semibold text-navy-900" htmlFor="exam">
              Exam type
            </label>
            <select id="exam" name="exam" className="input" defaultValue={examOk ? exam : ""}>
              <option value="">Select…</option>
              {EXAM_TYPES.map((e) => (
                <option key={e} value={e}>
                  {EXAM_LABEL[e]}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary">Continue</button>
          {subjects.length === 0 && <Alert tone="warn">No subject is assigned to you yet. Ask the Admin / HOD.</Alert>}
        </form>
      </Card>

      <Card>
        <CardHeader title="Step 2: Download the template and upload" subtitle="Excel (.xlsx) or CSV · max 3MB · max 5000 rows" />
        {subject && examOk ? (
          <div className="space-y-4 p-5">
            <div className="rounded-lg bg-paper-2 p-3 text-sm">
              <b className="text-navy-900">{subject.code}</b> {subject.name} · {EXAM_LABEL[exam]}
            </div>
            <DownloadLink href={`/api/templates/marks?subject=${subject.id}&exam=${exam}`}>
              <Download className="size-4" /> Download template (with student list)
            </DownloadLink>
            <ActionForm action={previewMarksUpload} encType="multipart/form-data">
              <input type="hidden" name="subject_id" value={subject.id} />
              <input type="hidden" name="exam_type" value={exam} />
              <Field name="file" label="Completed sheet" as="file" accept=".xlsx,.csv" required />
              <SubmitButton>Upload and view preview</SubmitButton>
            </ActionForm>
          </div>
        ) : (
          <p className="p-5 text-sm text-muted">First select the subject and exam in Step 1.</p>
        )}
      </Card>
    </div>
  );
}
