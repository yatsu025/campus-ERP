import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, ShieldAlert } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NOC_DOC_TYPES, NOC_STATUS_LABEL, RISK_TONE as riskTone, type NocDocType } from "@/lib/constants";
import { cn, fmtDate, fmtDateTime, isUuid } from "@/lib/utils";
import { decideNoc } from "../../actions";
import { ActionForm, Field, SubmitButton } from "@/components/ui/form";
import { Alert, Badge, Card, CardHeader, PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Review NOC" };

type Flag = { code: string; severity: "low" | "medium" | "high"; message: string; source?: string; doc_type?: string };
const sevTone = { high: "bad", medium: "warn", low: "info" } as const;

export default async function NocDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("hod");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const { data: r } = await supabase
    .from("noc_requests")
    .select("*, students(name,univ_roll_no,semester,courses(name,code)), noc_documents(id,doc_type,original_name,mime_type,size_bytes,created_at)")
    .eq("id", id)
    .maybeSingle();
  if (!r || r.status === "draft") notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s: any = r.students;
  const flags = ((r.red_flags ?? []) as Flag[]).sort((a, b) => ["high", "medium", "low"].indexOf(a.severity) - ["high", "medium", "low"].indexOf(b.severity));
  const open = r.status === "applied" || r.status === "under_review";
  const rows: [string, string][] = [
    ["Student", `${s?.name} (${s?.univ_roll_no})`],
    ["Course", `${s?.courses?.name} · Sem ${s?.semester}`],
    ["Company", r.company_name],
    ["Company email", r.company_email],
    ["Website", r.company_website ?? "-"],
    ["Role", r.position],
    ["Period", `${fmtDate(r.start_date)} to ${fmtDate(r.end_date)}`],
    ["Submitted", fmtDateTime(r.submitted_at)],
  ];

  return (
    <>
      <Link href="/hod/noc/requests" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-navy-800 hover:underline"><ArrowLeft className="size-4" /> All requests</Link>
      <PageHeader kicker="NOC review" title={r.company_name} description={r.purpose} actions={<><Badge tone={r.status === "approved" ? "ok" : r.status === "rejected" ? "bad" : "info"}>{NOC_STATUS_LABEL[r.status as keyof typeof NOC_STATUS_LABEL]}</Badge>{r.risk_level && <Badge tone={riskTone[r.risk_level as keyof typeof riskTone]}>Risk: {r.risk_level.toUpperCase()}</Badge>}</>} />

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <dl className="divide-y divide-line">
              {rows.map(([k, v]) => (
                <div key={k} className="grid gap-1 px-5 py-2.5 sm:grid-cols-[10rem_1fr]">
                  <dt className="text-xs font-bold uppercase tracking-wider text-muted">{k}</dt>
                  <dd className="break-words text-sm font-medium text-navy-900">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Documents" subtitle="The link is valid for 60 seconds. Every view is logged." />
            <ul className="divide-y divide-line">
              {(r.noc_documents as { id: string; doc_type: string; original_name: string; size_bytes: number }[]).map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <div className="min-w-0"><p className="font-semibold text-navy-900">{NOC_DOC_TYPES[d.doc_type as NocDocType] ?? d.doc_type}</p><p className="truncate text-xs text-muted">{d.original_name} · {(d.size_bytes / 1024).toFixed(0)} KB</p></div>
                  <a href={`/api/noc/documents/${d.id}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm"><ExternalLink className="size-3.5" /> View</a>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Red flags" subtitle="Automatic checks: this is not the final decision" />
            {flags.length ? (
              <ul className="space-y-2 p-4">
                {flags.map((f, i) => (
                  <li key={i} className={cn("flex gap-2.5 rounded-lg border p-3 text-sm", f.severity === "high" ? "border-[#f0c3bf] bg-[#fdeeec]" : f.severity === "medium" ? "border-[#efd9a8] bg-[#fcf5e3]" : "border-line bg-paper-2/60")}>
                    <ShieldAlert className={cn("mt-0.5 size-4 shrink-0", f.severity === "high" ? "text-bad" : f.severity === "medium" ? "text-warn" : "text-muted")} />
                    <div>
                      <div className="mb-0.5 flex items-center gap-2"><Badge tone={sevTone[f.severity]}>{f.severity}</Badge>{f.doc_type && <span className="text-xs text-muted">{NOC_DOC_TYPES[f.doc_type as NocDocType] ?? f.doc_type}</span>}</div>
                      {f.message}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-5 text-sm text-ok">No red flags found.</p>
            )}
          </Card>

          {open ? (
            <Card>
              <CardHeader title="Decision" />
              <div className="space-y-4 p-5">
                {r.status === "applied" && (
                  <ActionForm action={decideNoc} className="!space-y-0">
                    <input type="hidden" name="request_id" value={r.id} />
                    <input type="hidden" name="decision" value="under_review" />
                    <SubmitButton variant="ghost" size="sm">Mark as Under Review</SubmitButton>
                  </ActionForm>
                )}
                <ActionForm action={decideNoc}>
                  <input type="hidden" name="request_id" value={r.id} />
                  <Field name="remark" as="textarea" rows={3} label="Remark" hint="Required when rejecting. The student will see it." />
                  <div className="flex flex-wrap gap-2">
                    <button name="decision" value="approved" className="btn btn-primary">Approve</button>
                    <button name="decision" value="rejected" className="btn btn-danger">Reject</button>
                  </div>
                </ActionForm>
              </div>
            </Card>
          ) : (
            <Alert tone={r.status === "approved" ? "ok" : "bad"} title={`${NOC_STATUS_LABEL[r.status as keyof typeof NOC_STATUS_LABEL]} · ${fmtDateTime(r.decided_at)}`}>{r.remark || "No remark."}</Alert>
          )}
        </div>
      </div>
    </>
  );
}
