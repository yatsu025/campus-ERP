"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, BookOpen, CalendarCheck, ClipboardCheck, FileCheck2, FilePlus2, GraduationCap, History,
  KeyRound, Layers, LayoutDashboard, Menu, ScrollText, Settings2, ShieldCheck, Upload, UserRound, Users, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  dashboard: LayoutDashboard,
  attendance: CalendarCheck,
  marks: GraduationCap,
  "noc-apply": FilePlus2,
  "noc-status": FileCheck2,
  profile: UserRound,
  upload: Upload,
  history: History,
  sections: Layers,
  reports: BarChart3,
  settings: Settings2,
  users: Users,
  academics: BookOpen,
  audit: ScrollText,
  password: KeyRound,
  shield: ShieldCheck,
  check: ClipboardCheck,
} as const;

const ShellCtx = createContext<{ close: () => void }>({ close: () => {} });

export function NavLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  const pathname = usePathname();
  const { close } = useContext(ShellCtx);
  const Icon = ICONS[icon as keyof typeof ICONS] ?? LayoutDashboard;
  const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
  return (
    <Link
      href={href}
      onClick={close}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[0.86rem] font-medium transition-colors",
        active ? "bg-white/12 text-white" : "text-white/70 hover:bg-white/8 hover:text-white",
      )}
    >
      {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-crimson" />}
      <Icon className={cn("size-[1.05rem] shrink-0", active ? "text-white" : "text-white/55 group-hover:text-white")} />
      {label}
    </Link>
  );
}

export function ShellFrame({
  sidebar,
  topbar,
  children,
}: {
  sidebar: React.ReactNode;
  topbar: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <ShellCtx.Provider value={{ close: () => setOpen(false) }}>
      <div className="min-h-dvh lg:pl-[17rem]">
        {/* overlay (mobile) */}
        <div
          onClick={() => setOpen(false)}
          className={cn("fixed inset-0 z-40 bg-navy-950/60 backdrop-blur-[2px] transition-opacity lg:hidden", open ? "opacity-100" : "pointer-events-none opacity-0")}
        />
        <aside
          className={cn(
            "bg-grid fixed inset-y-0 left-0 z-50 flex w-[17rem] flex-col bg-navy-900 transition-transform duration-300 lg:translate-x-0",
            open ? "translate-x-0" : "-translate-x-full",
          )}
          aria-label="Main navigation"
        >
          <button onClick={() => setOpen(false)} className="absolute right-3 top-3 rounded-md p-1.5 text-white/70 hover:bg-white/10 lg:hidden" aria-label="Close menu">
            <X className="size-5" />
          </button>
          {sidebar}
        </aside>

        <div className="flex min-h-dvh flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-paper/90 px-4 backdrop-blur sm:px-6">
            <button onClick={() => setOpen(true)} className="rounded-md border border-line bg-white p-2 text-navy-900 lg:hidden" aria-label="Open menu">
              <Menu className="size-5" />
            </button>
            {topbar}
          </header>
          <main className="mx-auto w-full max-w-[84rem] flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
        </div>
      </div>
    </ShellCtx.Provider>
  );
}
