import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PAGE_SIZE } from "@/lib/constants";
import { parseDate } from "@/lib/dates";
import { fmtDateTime, pageParam, safeLike, strParam } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader, Pagination, TableWrap } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Audit logs" };

export default async function AuditLogs({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole("admin");
  const sp = await searchParams;
  const supabase = await createClient();
  const page = pageParam(sp.page);
  const who = safeLike(strParam(sp.user, 60));
  const action = strParam(sp.action, 40).replace(/[^a-z0-9._]/gi, "");
  const from = parseDate(strParam(sp.from, 10));
  const to = parseDate(strParam(sp.to, 10));

  let ids: string[] | null = null;
  if (who) {
    const { data } = await supabase.from("users").select("id").or(`full_name.ilike.%${who}%,email.ilike.%${who}%`).limit(200);
    ids = (data ?? []).map((u) => u.id);
  }
  let q = supabase.from("audit_logs").select("id,action,entity,entity_id,details,created_at,users(full_name,email,role)", { count: "exact" }).order("created_at", { ascending: false });
  if (ids) q = ids.length ? q.in("user_id", ids) : q.in("user_id", ["00000000-0000-0000-0000-000000000000"]);
  if (action) q = q.ilike("action", `${action}%`);
  if (from) q = q.gte("created_at", `${from}T00:00:00+05:30`);
  if (to) q = q.lte("created_at", `${to}T23:59:59+05:30`);
  const { data, count } = await q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  return (
    <>
      <PageHeader kicker="Security" title="Audit logs" description="Who did what and when. This record cannot be changed." />
      <form method="get" className="card mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_auto]">
        <input name="user" defaultValue={who} placeholder="User (name / email)" className="input" />
        <input name="action" defaultValue={action} placeholder="Action (e.g. marks.)" className="input" />
        <input name="from" type="date" defaultValue={from ?? ""} className="input" aria-label="From" />
        <input name="to" type="date" defaultValue={to ?? ""} className="input" aria-label="To" />
        <button className="btn btn-primary">Filter</button>
      </form>
      <Card>
        {data?.length ? (
          <>
            <TableWrap>
              <thead><tr><th className="th">When</th><th className="th">User</th><th className="th">Action</th><th className="th">Entity</th><th className="th">Details</th></tr></thead>
              <tbody>
                {data.map((l) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const u: any = l.users;
                  const d = JSON.stringify(l.details ?? {});
                  return (
                    <tr key={l.id}>
                      <td className="td whitespace-nowrap text-xs text-muted">{fmtDateTime(l.created_at)}</td>
                      <td className="td"><p className="font-semibold text-navy-900">{u?.full_name ?? "system"}</p><p className="text-xs text-muted">{u?.role}</p></td>
                      <td className="td"><Badge tone="info">{l.action}</Badge></td>
                      <td className="td text-xs">{l.entity ?? "-"}</td>
                      <td className="td max-w-72 truncate font-mono text-[0.72rem] text-muted" title={d}>{d === "{}" ? "-" : d}</td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
            <Pagination page={page} total={count ?? 0} basePath="/admin/audit-logs" params={{ user: who, action, from: from ?? undefined, to: to ?? undefined }} />
          </>
        ) : (
          <EmptyState title="No logs found" text="Try changing the filters." />
        )}
      </Card>
    </>
  );
}
