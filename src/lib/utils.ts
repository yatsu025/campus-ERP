import { clsx, type ClassValue } from "clsx";

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  // Treat a date like "2026-11-07" as UTC midnight so it does not shift into IST
  const d = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00+05:30`) : new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : dateFmt.format(d);
}

export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : dateTimeFmt.format(d);
}

export function timeAgo(value: string | Date): string {
  const diff = Date.now() - new Date(value).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hours ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} days ago`;
  return fmtDate(value as string);
}

export const toNum = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Academic session: July to June. Example: Nov 2026 => "2026-2027" */
export function currentSession(now = new Date()): string {
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const y = ist.getFullYear();
  const start = ist.getMonth() >= 6 ? y : y - 1;
  return `${start}-${start + 1}`;
}

export function pageParam(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n > 0 && n < 100000 ? n : 1;
}

export function strParam(value: string | string[] | undefined, max = 100): string {
  const v = Array.isArray(value) ? value[0] : value;
  return (v ?? "").toString().slice(0, max).trim();
}

export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Strip special characters from user input for ilike filters */
export const safeLike = (v: string) => v.replace(/[%_,()\\]/g, " ").trim();
