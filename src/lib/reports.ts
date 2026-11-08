import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ATTENDANCE_THRESHOLD } from "@/lib/constants";
import { isUuid, toNum } from "@/lib/utils";

export type ReportFilters = { subjectId?: string; sectionId?: string; view: "low" | "all" };
export type ReportRow = { roll: string; name: string; subject: string; subjectName: string; total: number; present: number; percentage: number };

/** Attendance report. Runs within the user's RLS, so an HOD/teacher only sees their own scope. */
export async function attendanceReport(f: ReportFilters, opts: { from?: number; to?: number } = {}): Promise<{ rows: ReportRow[]; total: number }> {
  const supabase = await createClient();
  let studentIds: string[] | null = null;
  if (f.sectionId && isUuid(f.sectionId)) {
    const { data } = await supabase.from("student_sections").select("student_id").eq("section_id", f.sectionId).limit(5000);
    studentIds = (data ?? []).map((r) => r.student_id);
    if (!studentIds.length) return { rows: [], total: 0 };
  }

  let q = supabase.from("attendance_summary").select("student_id,subject_id,total,present,percentage", { count: "exact" });
  if (f.subjectId && isUuid(f.subjectId)) q = q.eq("subject_id", f.subjectId);
  if (studentIds) q = q.in("student_id", studentIds);
  if (f.view === "low") q = q.lt("percentage", ATTENDANCE_THRESHOLD);
  const { data, count } = await q.order("percentage", { ascending: true }).range(opts.from ?? 0, opts.to ?? 4999);
  const sum = data ?? [];
  if (!sum.length) return { rows: [], total: count ?? 0 };

  const [{ data: studs }, { data: subs }] = await Promise.all([
    supabase.from("students").select("id,name,univ_roll_no").in("id", [...new Set(sum.map((s) => s.student_id))]),
    supabase.from("subjects").select("id,code,name").in("id", [...new Set(sum.map((s) => s.subject_id))]),
  ]);
  const sm = new Map((studs ?? []).map((s) => [s.id, s]));
  const bm = new Map((subs ?? []).map((s) => [s.id, s]));
  return {
    total: count ?? sum.length,
    rows: sum.map((s) => ({
      roll: sm.get(s.student_id)?.univ_roll_no ?? "?",
      name: sm.get(s.student_id)?.name ?? "?",
      subject: bm.get(s.subject_id)?.code ?? "?",
      subjectName: bm.get(s.subject_id)?.name ?? "",
      total: s.total,
      present: s.present,
      percentage: toNum(s.percentage),
    })),
  };
}
