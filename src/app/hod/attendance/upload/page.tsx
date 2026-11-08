import type { Metadata } from "next";
import { Download } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseDate } from "@/lib/dates";
import { allowedSubjects, subjectLabel } from "@/lib/scope";
import { isUuid, strParam } from "@/lib/utils";
import { confirmAttendanceUpload, previewAttendanceUpload } from "@/app/actions/attendance";
import { ActionForm, Field, SubmitButton } from "@/components/ui/form";
import { Alert, Card, CardHeader, DownloadLink, PageHeader } from "@/components/ui/primitives";
import { UploadPreview } from "@/components/ui/upload-preview";

export const metadata: Metadata = { title: "Upload attendance" };

export default async function HodAttendanceUpload({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole("hod");
  const sp = await searchParams;
  const supabase = await createClient();

  const uploadId = strParam(sp.upload, 40);
  if (isUuid(uploadId)) {
    const { data: log } = await supabase.from("upload_logs").select("id,file_name,rows_total,rows_ok,rows_failed,payload,status,meta").eq("id", uploadId).eq("type", "attendance").maybeSingle();
    return (
      <>
        <PageHeader kicker="Attendance" title="Upload preview" description="Students have been matched by roll number. If everything looks correct, confirm." />
        {log ? (
          <UploadPreview
            log={log}
            confirmAction={confirmAttendanceUpload}
            backPath="/hod/attendance/upload"
            columns={[
              { key: "roll", label: "Roll No." },
              { key: "name", label: "Student" },
              { key: "subjectCode", label: "Subject" },
              { key: "date", label: "Date" },
              { key: "status", label: "Status" },
            ]}
          />
        ) : (
          <Alert tone="bad">This upload was not found.</Alert>
        )}
      </>
    );
  }

  const from = parseDate(strParam(sp.from, 10)) ?? "";
  const to = parseDate(strParam(sp.to, 10)) ?? "";
  const sectionId = isUuid(strParam(sp.section, 40)) ? strParam(sp.section, 40) : "";
  const subjectId = isUuid(strParam(sp.subject, 40)) ? strParam(sp.subject, 40) : "";

  const subjects = await allowedSubjects(user);
  const courseIds = [...new Set(subjects.map((s) => s.course_id))];
  const { data: sections } = courseIds.length ? await supabase.from("sections").select("id,name,semester,course_id,courses(code)").in("course_id", courseIds).order("semester").order("name") : { data: [] };
  const subject = subjects.find((s) => s.id === subjectId);
  const ready = Boolean(from && to && from <= to);
  const canTemplate = ready && sectionId && subject;

  return (
    <>
      <PageHeader
        kicker="Attendance"
        title="Upload attendance"
        description="Roll numbers are pre-filled in the template. Attendance is matched by roll number, so records stay correct even if a section changes."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Step 1: Choose a range" subtitle="Choose a section and subject to generate the template" />
          <form method="get" className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[0.8rem] font-semibold text-navy-900" htmlFor="from">From date</label>
              <input id="from" name="from" type="date" className="input" defaultValue={from} />
            </div>
            <div>
              <label className="mb-1.5 block text-[0.8rem] font-semibold text-navy-900" htmlFor="to">To date</label>
              <input id="to" name="to" type="date" className="input" defaultValue={to} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[0.8rem] font-semibold text-navy-900" htmlFor="section">Section</label>
              <select id="section" name="section" className="input" defaultValue={sectionId}>
                <option value="">Select…</option>
                {(sections ?? []).map((s) => (
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  <option key={s.id} value={s.id}>{(s.courses as any)?.code} · Sem {s.semester} · Section {s.name}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[0.8rem] font-semibold text-navy-900" htmlFor="subject">Subject (for the template)</label>
              <select id="subject" name="subject" className="input" defaultValue={subjectId}>
                <option value="">Select…</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{subjectLabel(s)}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <button className="btn btn-primary">Continue</button>
            </div>
          </form>
        </Card>

        <Card>
          <CardHeader title="Step 2: Template download + upload" subtitle="Excel (.xlsx) or CSV · max 3MB · max 5000 rows" />
          {ready ? (
            <div className="space-y-4 p-5">
              {canTemplate ? (
                <DownloadLink href={`/api/templates/attendance?section=${sectionId}&subject=${subjectId}&from=${from}&to=${to}`}>
                  <Download className="size-4" /> Template download ({subject!.code})
                </DownloadLink>
              ) : (
                <Alert tone="info">Choose a section and subject for the template. If you already have your own sheet, you can upload it directly.</Alert>
              )}
              <ActionForm action={previewAttendanceUpload} encType="multipart/form-data">
                <input type="hidden" name="from" value={from} />
                <input type="hidden" name="to" value={to} />
                <input type="hidden" name="section_id" value={sectionId} />
                <Field name="file" label="Filled sheet" as="file" accept=".xlsx,.csv" required />
                <SubmitButton>Upload and preview</SubmitButton>
              </ActionForm>
            </div>
          ) : (
            <p className="p-5 text-sm text-muted">First choose a date range in Step 1.</p>
          )}
        </Card>
      </div>
    </>
  );
}
