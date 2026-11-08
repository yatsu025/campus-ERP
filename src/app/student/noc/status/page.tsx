import type { Metadata } from "next";
import { Download } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NOC_DOC_TYPES, NOC_STATUS_LABEL, type NocDocType } from "@/lib/constants";
import { cn, fmtDate, fmtDateTime } from "@/lib/utils";
import { Alert, Badge, ButtonLink, Card, DownloadLink, EmptyState, PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "NOC status" };

const tone = { draft: "mute", applied: "info", under_review: "warn", approved: "ok", rejected: "bad" } as const;
const STEPS = ["applied", "under_review", "decision"] as const;

export default async function NocStatus() {
  const user = await requireRole("student");
  const supabase = await createClient();
  const { data: reqs } = await supabase
    .from("noc_requests")
    .select("id,status,company_name,position,start_date,end_date,remark,decided_at,submitted_at,created_at,noc_documents(doc_type,original_name)")
    .eq("student_id", user.student!.id)
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader kicker="NOC" title="NOC status" description="All your NOC requests and the HOD's decision." actions={<ButtonLink href="/student/noc/apply" variant="accent">New request</ButtonLink>} />
      {!reqs?.length ? (
        <Card>
          <EmptyState title="No NOC request yet" text="When the portal is open, start with 'Apply for NOC'." />
        </Card>
      ) : (
        <div className="space-y-5">
          {reqs.map((r) => {
            const stage = r.status === "applied" ? 0 : r.status === "under_review" ? 1 : r.status === "approved" || r.status === "rejected" ? 2 : -1;
            return (
              <Card key={r.id}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
                  <div>
                    <h2 className="text-lg font-semibold text-navy-900">{r.company_name}</h2>
                    <p className="text-sm text-muted">
                      {r.position} · {fmtDate(r.start_date)} to {fmtDate(r.end_date)}
                    </p>
                  </div>
                  <Badge tone={tone[r.status as keyof typeof tone]}>{NOC_STATUS_LABEL[r.status as keyof typeof NOC_STATUS_LABEL]}</Badge>
                </div>
                <div className="space-y-5 p-5">
                  {r.status === "draft" ? (
                    <Alert tone="warn" title="This is still a draft">
                      Upload the documents and submit. <ButtonLink href="/student/noc/apply" variant="ghost" size="sm">Continue</ButtonLink>
                    </Alert>
                  ) : (
                    <ol className="grid grid-cols-3 gap-2">
                      {STEPS.map((s, i) => {
                        const done = i <= stage;
                        const bad = i === 2 && r.status === "rejected";
                        return (
                          <li key={s} className="text-center">
                            <div className={cn("mx-auto h-1.5 rounded-full", done ? (bad ? "bg-bad" : "bg-navy-900") : "bg-paper-2")} />
                            <p className={cn("mt-2 text-xs font-semibold", done ? "text-navy-900" : "text-muted")}>
                              {s === "applied" ? "Applied" : s === "under_review" ? "Under review" : r.status === "rejected" ? "Rejected" : r.status === "approved" ? "Approved" : "Decision"}
                            </p>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                  {r.remark && (
                    <Alert tone={r.status === "approved" ? "ok" : "bad"} title="HOD remark">
                      {r.remark}
                    </Alert>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
                    <span>
                      {r.submitted_at ? `Submitted ${fmtDateTime(r.submitted_at)}` : `Created ${fmtDateTime(r.created_at)}`}
                      {r.decided_at ? ` · Decision ${fmtDateTime(r.decided_at)}` : ""}
                    </span>
                    <span>
                      {(r.noc_documents as { doc_type: string }[] | null)?.map((d) => NOC_DOC_TYPES[d.doc_type as NocDocType] ?? d.doc_type).join(" · ")}
                    </span>
                  </div>
                  {r.status === "approved" && (
                    <DownloadLink href={`/student/noc/${r.id}/download`} variant="primary">
                      <Download className="size-4" /> NOC download (PDF)
                    </DownloadLink>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
