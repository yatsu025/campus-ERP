import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/constants";

export type SessionUser = {
  id: string;
  email: string;
  role: Role;
  fullName: string;
  mustChangePassword: boolean;
  instituteName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  student: {
    id: string;
    rollNo: string;
    semester: number;
    courseId: string;
    courseName: string;
    courseCode: string;
  } | null;
  teacher: { id: string } | null;
};

export const homeFor = (role: Role) => `/${role}/dashboard`;

/** The logged-in user for this request (verified). Hits the DB only once per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: row } = await supabase
    .from("users")
    .select("id,email,role,full_name,is_active,must_change_password")
    .eq("id", user.id)
    .maybeSingle();
  if (!row || !row.is_active) return null;

  const base: SessionUser = {
    id: row.id,
    email: row.email,
    role: row.role as Role,
    fullName: row.full_name,
    mustChangePassword: row.must_change_password,
    instituteName: null,
    departmentId: null,
    departmentName: null,
    student: null,
    teacher: null,
  };

  if (row.role === "student") {
    const { data: s } = await supabase
      .from("students")
      .select("id,univ_roll_no,semester,course_id,courses(code,name,department_id,departments(name,institutes(name)))")
      .eq("user_id", row.id)
      .maybeSingle();
    if (s) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c: any = s.courses;
      base.student = { id: s.id, rollNo: s.univ_roll_no, semester: s.semester, courseId: s.course_id, courseName: c?.name ?? "", courseCode: c?.code ?? "" };
      base.departmentId = c?.department_id ?? null;
      base.departmentName = c?.departments?.name ?? null;
      base.instituteName = c?.departments?.institutes?.name ?? null;
    }
  } else if (row.role === "teacher" || row.role === "hod") {
    const { data: t } = await supabase
      .from("teachers")
      .select("id,department_id,departments(name,institutes(name))")
      .eq("user_id", row.id)
      .maybeSingle();
    if (t) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d: any = t.departments;
      base.teacher = { id: t.id };
      base.departmentId = t.department_id;
      base.departmentName = d?.name ?? null;
      base.instituteName = d?.institutes?.name ?? null;
    }
  }
  return base;
});

/** Login required. If not authenticated, redirects to /login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/auth/signout?reason=session");
  return user;
}

/**
 * Role guard. Applies at the start of every page AND every Server Action
 * (we do not rely on the proxy or on hiding the UI alone).
 */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/403");
  // Deny access if a student/teacher profile record is missing
  if (user.role === "student" && !user.student) redirect("/403");
  if ((user.role === "teacher" || user.role === "hod") && !user.teacher) redirect("/403");
  return user;
}

/** Same as requireRole, but used in page layouts (also checks for a forced password change). */
export async function requireRoleForPage(...roles: Role[]): Promise<SessionUser> {
  const user = await requireRole(...roles);
  if (user.mustChangePassword) redirect("/change-password");
  return user;
}
