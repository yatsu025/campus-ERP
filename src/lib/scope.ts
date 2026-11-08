import "server-only";
import { createClient } from "@/lib/supabase/server";
import { admin } from "@/lib/supabase/admin";
import type { SessionUser } from "@/lib/auth";

export type SubjectRow = {
  id: string;
  code: string;
  name: string;
  semester: number;
  course_id: string;
  courseName: string;
  courseCode: string;
  departmentId: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapSubject = (s: any): SubjectRow => ({
  id: s.id,
  code: s.code,
  name: s.name,
  semester: s.semester,
  course_id: s.course_id,
  courseName: s.courses?.name ?? "",
  courseCode: s.courses?.code ?? "",
  departmentId: s.courses?.department_id ?? "",
});

const SUBJECT_SELECT = "id,code,name,semester,course_id,courses!inner(name,code,department_id)";

/** Which subjects are allowed for this user: HOD = whole department, Teacher = assigned ones, Admin = all */
export async function allowedSubjects(user: SessionUser): Promise<SubjectRow[]> {
  const supabase = await createClient();
  if (user.role === "teacher") {
    const { data } = await supabase
      .from("teacher_subjects")
      .select(`subjects!inner(${SUBJECT_SELECT})`)
      .eq("teacher_id", user.teacher!.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((r: any) => mapSubject(r.subjects)).filter((s) => s.departmentId === user.departmentId).sort((a, b) => a.code.localeCompare(b.code));
  }
  let q = supabase.from("subjects").select(SUBJECT_SELECT).order("code");
  if (user.role === "hod") q = q.eq("courses.department_id", user.departmentId!);
  const { data } = await q;
  return (data ?? []).map(mapSubject);
}

export async function getAllowedSubject(user: SessionUser, subjectId: string): Promise<SubjectRow | null> {
  return (await allowedSubjects(user)).find((s) => s.id === subjectId) ?? null;
}

/** All courses of the department (id list) */
export async function departmentCourses(departmentId: string) {
  const { data } = await admin().from("courses").select("id,code,name,total_semesters").eq("department_id", departmentId).order("code");
  return data ?? [];
}

/** HOD users of the department (for notifications) */
export async function hodUserIds(departmentId: string): Promise<string[]> {
  const { data } = await admin()
    .from("teachers")
    .select("user_id,users!inner(role,is_active)")
    .eq("department_id", departmentId)
    .eq("users.role", "hod")
    .eq("users.is_active", true);
  return (data ?? []).map((h) => h.user_id);
}

export const subjectLabel = (s: SubjectRow) => `${s.courseCode} · Sem ${s.semester} · ${s.code} ${s.name}`;
