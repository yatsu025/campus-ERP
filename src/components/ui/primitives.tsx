import Link from "next/link";
import Image from "next/image";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { PAGE_SIZE } from "@/lib/constants";

export function BrandLogo({ variant = "full", className, priority }: { variant?: "full" | "mark"; className?: string; priority?: boolean }) {
  return variant === "full" ? (
    <Image src="/brand/united-logo.png" alt="United Group of Institutions" width={920} height={296} priority={priority} className={cn("h-12 w-auto", className)} />
  ) : (
    <Image src="/brand/united-mark.png" alt="United" width={370} height={310} priority={priority} className={cn("h-9 w-auto", className)} />
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("card", className)}>{children}</section>;
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div>
        <h2 className="text-lg font-semibold text-navy-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="rise mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {kicker && <p className="kicker mb-1.5">{kicker}</p>}
        <h1 className="text-[1.75rem] font-semibold leading-tight text-navy-900 sm:text-[2.1rem]">{title}</h1>
        <div className="mt-2 h-[3px] w-12 rounded-full bg-crimson" />
        {description && <p className="mt-3 text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

const TONE = {
  navy: "border-t-navy-900",
  crimson: "border-t-crimson",
  ok: "border-t-ok",
  warn: "border-t-warn",
  bad: "border-t-bad",
} as const;

export function Stat({
  label,
  value,
  hint,
  tone = "navy",
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: keyof typeof TONE;
  href?: string;
}) {
  const body = (
    <div className={cn("card rise h-full border-t-[3px] p-4 transition-shadow", TONE[tone], href && "hover:shadow-[0_6px_24px_-12px_rgb(11_31_74/.35)]")}>
      <p className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className="font-display mt-1.5 text-[2rem] font-semibold leading-none text-navy-900">{value}</p>
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Badge({ tone = "mute", children }: { tone?: "ok" | "warn" | "bad" | "info" | "mute"; children: React.ReactNode }) {
  return <span className={cn("badge", `badge-${tone}`)}>{children}</span>;
}

export function Alert({ tone = "info", title, children }: { tone?: "info" | "warn" | "bad" | "ok"; title?: string; children?: React.ReactNode }) {
  const styles = {
    info: "border-[#c5d2ee] bg-[#eef2fb] text-navy-800",
    warn: "border-[#efd9a8] bg-[#fcf5e3] text-[#7a4d06]",
    bad: "border-[#f0c3bf] bg-[#fdeeec] text-bad",
    ok: "border-[#bfe3d0] bg-[#e9f6ef] text-ok",
  }[tone];
  const Icon = tone === "ok" ? CheckCircle2 : tone === "info" ? Info : AlertTriangle;
  return (
    <div className={cn("flex gap-3 rounded-lg border px-4 py-3 text-sm", styles)} role={tone === "bad" ? "alert" : undefined}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "leading-relaxed")}>{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 grid size-12 place-items-center rounded-full bg-paper-2 text-muted">
        <Inbox className="size-5" />
      </div>
      <p className="font-display text-lg font-semibold text-navy-900">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function TableWrap({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("scroll-thin overflow-x-auto", className)}>
      <table className="w-full border-collapse">{children}</table>
    </div>
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  size,
  children,
  prefetch,
}: {
  href: string;
  variant?: "primary" | "accent" | "ghost";
  size?: "sm";
  children: React.ReactNode;
  prefetch?: boolean;
}) {
  return (
    <Link href={href} prefetch={prefetch} className={cn("btn", `btn-${variant}`, size === "sm" && "btn-sm")}>
      {children}
    </Link>
  );
}

/** Plain <a> (for route handler downloads; no Next router prefetch needed) */
export function DownloadLink({ href, children, variant = "ghost" }: { href: string; children: React.ReactNode; variant?: "primary" | "ghost" | "accent" }) {
  return (
    <a href={href} className={cn("btn btn-sm", `btn-${variant}`)}>
      {children}
    </a>
  );
}

export function Pagination({
  page,
  total,
  basePath,
  params = {},
  pageSize = PAGE_SIZE,
}: {
  page: number;
  total: number;
  basePath: string;
  params?: Record<string, string | undefined>;
  pageSize?: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    q.set("page", String(p));
    return `${basePath}?${q.toString()}`;
  };
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-muted">
      <span>
        {from}-{to} of {total}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className="btn btn-ghost btn-sm">
            <ChevronLeft className="size-4" /> Prev
          </Link>
        ) : null}
        <span className="grid place-items-center px-2 text-xs font-semibold">
          {page} / {pages}
        </span>
        {page < pages ? (
          <Link href={href(page + 1)} className="btn btn-ghost btn-sm">
            Next <ChevronRight className="size-4" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** Color for attendance %: below 75 = red */
export function PercentBadge({ value, threshold = 75 }: { value: number; threshold?: number }) {
  const tone = value >= threshold ? "ok" : value >= threshold - 10 ? "warn" : "bad";
  return <Badge tone={tone}>{value.toFixed(1)}%</Badge>;
}

export function PoweredBy({ className, light }: { className?: string; light?: boolean }) {
  return (
    <p className={cn("text-xs", light ? "text-white/60" : "text-muted", className)}>
      Powered by <span className={cn("font-bold tracking-wide", light ? "text-white" : "text-navy-900")}>yatsu</span>
    </p>
  );
}
