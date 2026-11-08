import "server-only";

/** Today's date in IST, "YYYY-MM-DD" */
export const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/** Key like "2026-W45" (to send the low-attendance alert only once per week) */
export function isoWeekKey(d = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export type NocSettings = { open_date: string | null; close_date: string | null; required_docs: string[] } | null;

/** Is the NOC portal open or closed today? (based on the HOD's open/close dates) */
export function portalState(s: NocSettings): { open: boolean; reason: string } {
  if (!s || !s.open_date || !s.close_date) return { open: false, reason: "The HOD has not set the NOC portal dates yet." };
  const today = todayIST();
  if (today < s.open_date) return { open: false, reason: "The NOC portal is not open yet." };
  if (today > s.close_date) return { open: false, reason: "The NOC portal has closed." };
  return { open: true, reason: "" };
}

/** Attendance: how many consecutive classes must be attended to reach 75% */
export function classesToReach(total: number, present: number, threshold = 75): number {
  const t = threshold / 100;
  return Math.max(0, Math.ceil((t * total - present) / (1 - t)));
}
