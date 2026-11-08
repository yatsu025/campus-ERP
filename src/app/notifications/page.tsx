import type { Metadata } from "next";
import Link from "next/link";
import { CheckCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PAGE_SIZE } from "@/lib/constants";
import { cn, pageParam, timeAgo } from "@/lib/utils";
import { markAllRead, markRead } from "@/app/actions/notifications";
import { AppShell } from "@/components/shell/app-shell";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Card, EmptyState, PageHeader, Pagination } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const page = pageParam((await searchParams).page);
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("notifications")
    .select("id,title,message,link,is_read,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  return (
    <AppShell user={user}>
      <PageHeader
        kicker="Inbox"
        title="Notifications"
        description="Attendance alerts, marks publications and NOC updates all land here."
        actions={
          <form action={markAllRead}>
            <button className="btn btn-ghost"><CheckCheck className="size-4" /> Mark all as read</button>
          </form>
        }
      />
      <Card>
        {data?.length ? (
          <>
            <ul className="divide-y divide-line">
              {data.map((n) => (
                <li key={n.id} className={cn("flex items-start gap-3 px-5 py-4", !n.is_read && "bg-[#faf3f2]")}>
                  <span className={cn("mt-2 size-2 shrink-0 rounded-full", n.is_read ? "bg-line" : "bg-crimson")} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-navy-900">{n.title}</p>
                    <p className="mt-0.5 text-sm text-muted">{n.message}</p>
                    <p className="mt-1 text-xs text-muted/80">{timeAgo(n.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {n.link && <Link href={n.link} className="btn btn-ghost btn-sm">Open</Link>}
                    {!n.is_read && (
                      <ActionForm action={markRead} className="!space-y-0">
                        <input type="hidden" name="id" value={n.id} />
                        <SubmitButton variant="ghost" size="sm" pendingText="…">Read</SubmitButton>
                      </ActionForm>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={page} total={count ?? 0} basePath="/notifications" />
          </>
        ) : (
          <EmptyState title="No notifications" text="Anything new will show up here." />
        )}
      </Card>
    </AppShell>
  );
}
