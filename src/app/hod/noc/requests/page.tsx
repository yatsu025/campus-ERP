import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NOC_STATUS_LABEL, PAGE_SIZE, RISK_TONE as riskTone } from "@/lib/constants";
import { cn, fmtDate, pageParam, safeLike, strParam } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader, Pagination, TableWrap } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "NOC requests" };

const statusTone = { applied: "info", under_review: "warn", approved: "ok", rejected: "bad" } as const;
const FILTERS = ["pending", "applied", "under_review", "approved", "rejected", "all"] as const;

export default async function NocRequests({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole("hod");
  const sp = await searchParams;
  const supabase = await createClient();
  const status = (FILTERS as readonly string[]).includes(strParam(sp.status, 15)) ? strParam(sp.status, 15) : "pending";
  const q = safeLike(strParam(sp.q, 40));
  const page = pageParam(sp.page);

  let query = supabase
    .from("noc_requests")
    .select("id,status,risk_level,company_name,position,start_date,end_date,submitted_at,students!inner(name,univ_roll_no)", { count: "exact" })
    .neq("status", "draft")
    .order("submitted_at", { ascending: false });
  if (status === "pending") query = query.in("status", ["applied", "under_review"]);
  else if (status !== "all") query = query.eq("status", status);
  if (q) query = query.or(`name.ilike.%${q}%,univ_roll_no.ilike.%${q}%`, { referencedTable: "students" });
  const { data, count } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  return (
    <>
      <PageHeader kicker="NOC" title="NOC requests" description="The risk level is only a helper. Review the documents yourself before deciding." />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link key={f} href={`?status=${f}${q ? `&q=${q}` : ""}`} className={cn("badge !px-3 !py-1.5 !text-[0.8rem]", status === f ? "badge-info" : "badge-mute")}>
              {f === "pending" ? "Pending" : f === "all" ? "All" : NOC_STATUS_LABEL[f]}
            </Link>
          ))}
        </div>
        <form method="get" className="flex gap-2">
          <input type="hidden" name="status" value={status} />
          <input name="q" defaultValue={q} placeholder="Roll no. or name" className="input !w-52" />
          <button className="btn btn-ghost">Search</button>
        </form>
      </div>
      <Card>
        {data?.length ? (
          <>
            <TableWrap>
              <thead><tr><th className="th">Student</th><th className="th">Company</th><th className="th">Period</th><th className="th">Risk</th><th className="th">Status</th><th className="th">Submitted</th><th className="th" /></tr></thead>
              <tbody>
                {data.map((r) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const s: any = r.students;
                  return (
                    <tr key={r.id}>
                      <td className="td"><p className="font-semibold text-navy-900">{s?.name}</p><p className="text-xs text-muted">{s?.univ_roll_no}</p></td>
                      <td className="td"><p>{r.company_name}</p><p className="text-xs text-muted">{r.position}</p></td>
                      <td className="td text-xs">{fmtDate(r.start_date)} → {fmtDate(r.end_date)}</td>
                      <td className="td">{r.risk_level ? <Badge tone={riskTone[r.risk_level as keyof typeof riskTone]}>{r.risk_level.toUpperCase()}</Badge> : "-"}</td>
                      <td className="td"><Badge tone={statusTone[r.status as keyof typeof statusTone]}>{NOC_STATUS_LABEL[r.status as keyof typeof NOC_STATUS_LABEL]}</Badge></td>
                      <td className="td text-xs text-muted">{fmtDate(r.submitted_at)}</td>
                      <td className="td"><Link href={`/hod/noc/requests/${r.id}`} className="btn btn-ghost btn-sm">Review</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
            <Pagination page={page} total={count ?? 0} basePath="/hod/noc/requests" params={{ status, q }} />
          </>
        ) : (
          <EmptyState title="No requests found" text="Try changing the filter." />
        )}
      </Card>
    </>
  );
}
