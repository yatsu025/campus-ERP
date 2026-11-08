import "server-only";
import { randomInt } from "node:crypto";
import { admin } from "@/lib/supabase/admin";
import type { Role } from "@/lib/constants";

/** Random temporary password (12 chars, upper+lower+digit). Excludes ambiguous characters (0/O, 1/l). */
export function tempPassword(): string {
  const U = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const L = "abcdefghijkmnpqrstuvwxyz";
  const D = "23456789";
  const pick = (s: string) => s[randomInt(s.length)]!;
  const chars = [pick(U), pick(U), pick(L), pick(L), pick(L), pick(L), pick(D), pick(D), pick(D), pick(U + L + D), pick(U + L + D), pick(L)];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

export type NewUser = {
  role: Role;
  email: string;
  fullName: string;
  rollNo?: string;
  courseId?: string;
  semester?: number;
  phone?: string | null;
  departmentId?: string;
};

/** Auth user + users row + students/teachers row. If it fails midway, everything is rolled back. */
export async function createUserAccount(u: NewUser): Promise<{ ok: true; id: string; password: string } | { ok: false; error: string }> {
  const db = admin();
  const password = tempPassword();
  const { data: created, error } = await db.auth.admin.createUser({
    email: u.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: u.fullName },
  });
  if (error || !created.user) {
    return { ok: false, error: /already|registered|exists/i.test(error?.message ?? "") ? "This email is already registered" : "Could not create the account" };
  }
  const id = created.user.id;
  const rollback = async () => {
    await db.auth.admin.deleteUser(id);
  };

  const { error: e1 } = await db.from("users").insert({ id, email: u.email, role: u.role, full_name: u.fullName, must_change_password: true });
  if (e1) {
    await rollback();
    return { ok: false, error: "Could not create the user record" };
  }
  if (u.role === "student") {
    const { error: e2 } = await db.from("students").insert({ user_id: id, univ_roll_no: u.rollNo!, name: u.fullName, course_id: u.courseId!, semester: u.semester!, phone: u.phone || null });
    if (e2) {
      await rollback();
      return { ok: false, error: e2.code === "23505" ? "This roll number already exists" : "Could not create the student record" };
    }
  } else if (u.role === "teacher" || u.role === "hod") {
    const { error: e2 } = await db.from("teachers").insert({ user_id: id, name: u.fullName, department_id: u.departmentId! });
    if (e2) {
      await rollback();
      return { ok: false, error: "Could not create the teacher record" };
    }
  }
  return { ok: true, id, password };
}

/** Is there already an active HOD in the department? */
export async function activeHodExists(departmentId: string, exceptUserId?: string): Promise<boolean> {
  const { data } = await admin().from("teachers").select("user_id,users!inner(role,is_active)").eq("department_id", departmentId).eq("users.role", "hod").eq("users.is_active", true);
  return (data ?? []).some((t) => t.user_id !== exceptUserId);
}
