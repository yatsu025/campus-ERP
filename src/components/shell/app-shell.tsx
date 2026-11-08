import Link from "next/link";
import { Bell, KeyRound, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { SessionUser } from "@/lib/auth";
import { ROLE_LABEL, SITE } from "@/lib/constants";
import { currentSession } from "@/lib/utils";
import { logout } from "@/app/actions/auth";
import { BrandLogo, PoweredBy } from "@/components/ui/primitives";
import { NAV } from "./nav";
import { NavLink, ShellFrame } from "./shell-frame";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

export async function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const supabase = await createClient();
  const { count: unread } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false);

  const sidebar = (
    <>
      <div className="flex items-center gap-3 px-5 pb-5 pt-6">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-white shadow-[0_2px_0_rgb(0_0_0/.25)]">
          <BrandLogo variant="mark" className="h-7" />
        </div>
        <div className="leading-tight">
          <p className="font-display text-[1.05rem] font-semibold text-white">{SITE.name}</p>
          <p className="text-[0.68rem] font-medium uppercase tracking-[0.12em] text-white/55">United Group</p>
        </div>
      </div>

      <div className="mx-4 rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-crimson text-sm font-bold text-white">{initials(user.fullName)}</div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{user.fullName}</p>
            <p className="truncate text-xs text-white/60">{user.student ? `Roll ${user.student.rollNo}` : ROLE_LABEL[user.role]}</p>
          </div>
        </div>
      </div>

      <nav className="scroll-thin mt-4 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV[user.role].map((g) => (
          <div key={g.title}>
            <p className="px-3 pb-1.5 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-white/35">{g.title}</p>
            <div className="space-y-0.5">
              {g.items.map((i) => (
                <NavLink key={i.href} {...i} />
              ))}
            </div>
          </div>
        ))}
        <div>
          <p className="px-3 pb-1.5 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-white/35">Account</p>
          <div className="space-y-0.5">
            <NavLink href="/notifications" label="Notifications" icon="shield" />
            <NavLink href="/change-password" label="Change Password" icon="password" />
          </div>
        </div>
      </nav>

      <div className="border-t border-white/10 p-4">
        <form action={logout}>
          <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/10 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-crimson">
            <LogOut className="size-4" /> Log out
          </button>
        </form>
        <PoweredBy light className="mt-3 text-center" />
      </div>
    </>
  );

  const topbar = (
    <>
      <div className="min-w-0 flex-1">
        <p className="font-display truncate text-[0.95rem] font-semibold uppercase tracking-[0.02em] text-navy-900 sm:text-[1.05rem]">
          {user.instituteName ?? SITE.group}
        </p>
        <p className="hidden text-xs text-muted sm:block">
          Session {currentSession()}
          {user.departmentName ? ` · ${user.departmentName}` : ""}
          {user.student ? ` · ${user.student.courseName}, Sem ${user.student.semester}` : ""}
        </p>
      </div>
      <Link href="/notifications" className="relative rounded-lg border border-line bg-white p-2.5 text-navy-900 hover:bg-paper-2" aria-label="Notifications">
        <Bell className="size-[1.1rem]" />
        {!!unread && (
          <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-crimson px-1 text-[0.65rem] font-bold leading-5 text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
      <Link href="/change-password" className="hidden rounded-lg border border-line bg-white p-2.5 text-navy-900 hover:bg-paper-2 sm:block" aria-label="Change password">
        <KeyRound className="size-[1.1rem]" />
      </Link>
    </>
  );

  return (
    <ShellFrame sidebar={sidebar} topbar={topbar}>
      {children}
      <footer className="mt-12 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-xs text-muted">
        <span>
          © {new Date().getFullYear()} {SITE.group} · {SITE.name}
        </span>
        <PoweredBy />
      </footer>
    </ShellFrame>
  );
}
