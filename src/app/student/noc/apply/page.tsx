import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, FileUp, Send, Trash2 } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NOC_DOC_TYPES, type NocDocType } from "@/lib/constants";
import { portalState, type NocSettings } from "@/lib/data";
import { fmtDate } from "@/lib/utils";
import { ActionForm, Field, SubmitButton } from "@/components/ui/form";
import { Alert, Badge, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { discardNocDraft, saveNocDraft, submitNoc, uploadNocDocument } from "../actions";

export const metadata: Metadata = { title: "Apply for NOC" };

export default async function NocApply() {
  const user = await requireRole("student");
  const supabase = await createClient();
  const [{ data: settings }, { data: active }] = await Promise.all([
    supabase.from("noc_settings").select("open_date,close_date,required_docs").eq("department_id", user.departmentId!).maybeSingle(),
    supabase
      .from("noc_requests")
      .select("*")
      .eq("student_id", user.student!.id)
      .in("status", ["draft", "applied", "under_review", "approved"])
      .maybeSingle(),
  ]);
  const portal = portalState(settings as NocSettings);
  const required = ((settings?.required_docs ?? []) as string[]).filter((d) => d in NOC_DOC_TYPES) as NocDocType[];

  const { data: docs } = active?.status === "draft" ? await supabase.from("noc_documents").select("doc_type,original_name,size_bytes").eq("request_id", active.id) : { data: [] };
  const docMap = new Map((docs ?? []).map((d) => [d.doc_type, d]));

  return (
    <>
      <PageHeader kicker="NOC" title="Apply for NOC" description="Three steps: fill in the details, upload the documents, and submit. The final decision is made by the HOD." />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge tone={portal.open ? "ok" : "bad"}>{portal.open ? "Portal open" : "Portal closed"}</Badge>
        {settings?.open_date && settings?.close_date && (
          <span className="text-sm text-muted">
            {fmtDate(settings.open_date)} to {fmtDate(settings.close_date)}
          </span>
        )}
      </div>

      {active && active.status !== "draft" ? (
        <Alert tone="info" title="Your NOC request is being processed">
          Open the <Link className="font-semibold underline" href="/student/noc/status">NOC Status</Link> page to view the status.
        </Alert>
      ) : !portal.open ? (
        <Alert tone="warn" title="You cannot apply right now">
          {portal.reason}
        </Alert>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
          <Card>
            <CardHeader title="Step 1: Internship details" subtitle="Provide the company's official email. Free emails (gmail, etc.) are flagged." />
            <div className="p-5">
              <ActionForm action={saveNocDraft}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field name="company_name" label="Company name" defaultValue={active?.company_name} required />
                  <Field name="company_email" type="email" label="Company email (HR)" defaultValue={active?.company_email} required />
                  <Field name="company_website" label="Company website" placeholder="www.company.com" defaultValue={active?.company_website ?? ""} />
                  <Field name="position" label="Role / Position" defaultValue={active?.position} required />
                  <Field name="start_date" type="date" label="Start date" defaultValue={active?.start_date} required />
                  <Field name="end_date" type="date" label="End date" defaultValue={active?.end_date} required />
                </div>
                <Field name="purpose" as="textarea" label="Purpose / description" defaultValue={active?.purpose} required />
                <SubmitButton>{active ? "Update details" : "Save and continue"}</SubmitButton>
              </ActionForm>
            </div>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader title="Step 2: Documents" subtitle="PDF, JPG or PNG · max 3MB per file" />
              {!active ? (
                <p className="p-5 text-sm text-muted">Save Step 1 first, then documents can be uploaded here.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {required.map((t) => {
                    const d = docMap.get(t);
                    return (
                      <li key={t} className="p-4">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-navy-900">{NOC_DOC_TYPES[t]}</p>
                          {d ? (
                            <span className="flex items-center gap-1 text-xs font-semibold text-ok">
                              <CheckCircle2 className="size-4" /> Uploaded
                            </span>
                          ) : (
                            <Badge tone="warn">Pending</Badge>
                          )}
                        </div>
                        {d && <p className="mb-2 truncate text-xs text-muted">{d.original_name}</p>}
                        <ActionForm action={uploadNocDocument} encType="multipart/form-data" className="flex flex-wrap items-end gap-2 !space-y-0">
                          <input type="hidden" name="request_id" value={active.id} />
                          <input type="hidden" name="doc_type" value={t} />
                          <div className="min-w-0 flex-1">
                            <Field name="file" label="" as="file" accept=".pdf,.jpg,.jpeg,.png" />
                          </div>
                          <SubmitButton variant="ghost" size="sm" pendingText="Uploading…">
                            <FileUp className="size-4" /> {d ? "Replace" : "Upload"}
                          </SubmitButton>
                        </ActionForm>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            {active && (
              <Card>
                <CardHeader title="Step 3: Submit" subtitle="Details cannot be changed after submission." />
                <div className="space-y-3 p-5">
                  <ActionForm action={submitNoc}>
                    <input type="hidden" name="request_id" value={active.id} />
                    <SubmitButton variant="accent">
                      <Send className="size-4" /> Submit NOC request
                    </SubmitButton>
                  </ActionForm>
                  <ActionForm action={discardNocDraft}>
                    <input type="hidden" name="request_id" value={active.id} />
                    <SubmitButton variant="danger" size="sm">
                      <Trash2 className="size-4" /> Discard draft
                    </SubmitButton>
                  </ActionForm>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}
