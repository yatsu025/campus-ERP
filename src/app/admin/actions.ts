"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { fail, parseForm, succeed, type ActionState } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { MAX_SHEET_ROWS } from "@/lib/constants";
import { chunk } from "@/lib/utils";
import { readSheet, SheetError } from "@/lib/sheets";
import { accountEmail, activeHodExists, createUserAccount, EMAIL_DOMAIN_HINT, tempPassword } from "@/lib/users";
import { redirect } from "next/navigation";

const code = z.string().trim().regex(/^[A-Za-z0-9._-]{1,20}$/, "Code may contain only letters, numbers, . _ - (max 20).").transform((v) => v.toUpperCase());

/* ------------------------------ ACADEMICS ------------------------------ */
export async function createDepartment(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const parsed = parseForm(z.object({ institute_id: z.uuid("Select an institute."), name: z.string().trim().min(2, "Enter a name.").max(120) }), fd);
  if (!parsed.ok) return parsed.state;
  const { error } = await admin().from("departments").insert(parsed.data);
  if (error) return fail(error.code === "23505" ? "This department already exists in this institute." : "Could not create the department.");
  await audit({ userId: user.id, action: "academics.department_create", details: parsed.data });
  revalidatePath("/admin/academics");
  return succeed("Department created.");
}

export async function createCourse(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const parsed = parseForm(z.object({ department_id: z.uuid("Select a department."), code, name: z.string().trim().min(2, "Enter a name.").max(120), total_semesters: z.coerce.number().int().min(1).max(12) }), fd);
  if (!parsed.ok) return parsed.state;
  const { error } = await admin().from("courses").insert(parsed.data);
  if (error) return fail(error.code === "23505" ? "This course code already exists in this department." : "Could not create the course.");
  await audit({ userId: user.id, departmentId: parsed.data.department_id, action: "academics.course_create", details: parsed.data });
  revalidatePath("/admin/academics");
  return succeed("Course created.");
}

export async function createSubject(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const parsed = parseForm(z.object({ course_id: z.uuid("Select a course."), code, name: z.string().trim().min(2, "Enter a name.").max(150), semester: z.coerce.number().int().min(1).max(12) }), fd);
  if (!parsed.ok) return parsed.state;
  const { data: c } = await admin().from("courses").select("total_semesters,department_id").eq("id", parsed.data.course_id).maybeSingle();
  if (!c) return fail("Course not found.");
  if (parsed.data.semester > c.total_semesters) return fail(`This course has only ${c.total_semesters} semesters.`);
  const { error } = await admin().from("subjects").insert(parsed.data);
  if (error) return fail(error.code === "23505" ? "This subject code already exists in this course." : "Could not create the subject.");
  await audit({ userId: user.id, departmentId: c.department_id, action: "academics.subject_create", details: parsed.data });
  revalidatePath("/admin/academics");
  return succeed("Subject created.");
}

export async function assignSubject(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const parsed = parseForm(z.object({ teacher_id: z.uuid("Select a teacher."), subject_id: z.uuid("Select a subject.") }), fd);
  if (!parsed.ok) return parsed.state;
  const db = admin();
  const [{ data: t }, { data: s }] = await Promise.all([
    db.from("teachers").select("department_id").eq("id", parsed.data.teacher_id).maybeSingle(),
    db.from("subjects").select("courses(department_id)").eq("id", parsed.data.subject_id).maybeSingle(),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dep = (s?.courses as any)?.department_id;
  if (!t || !dep) return fail("Teacher or subject not found.");
  if (t.department_id !== dep) return fail("The teacher and the subject belong to different departments.");
  const { error } = await db.from("teacher_subjects").insert(parsed.data);
  if (error) return fail(error.code === "23505" ? "This subject is already assigned to this teacher." : "Could not assign.");
  await audit({ userId: user.id, departmentId: dep, action: "academics.subject_assign", details: parsed.data });
  revalidatePath("/admin/academics");
  return succeed("Subject assigned.");
}

export async function unassignSubject(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const parsed = parseForm(z.object({ teacher_id: z.uuid(), subject_id: z.uuid() }), fd);
  if (!parsed.ok) return parsed.state;
  await admin().from("teacher_subjects").delete().eq("teacher_id", parsed.data.teacher_id).eq("subject_id", parsed.data.subject_id);
  await audit({ userId: user.id, action: "academics.subject_unassign", details: parsed.data });
  revalidatePath("/admin/academics");
  return succeed("Removed.");
}

/* -------------------------------- USERS -------------------------------- */
const phone = z.string().trim().regex(/^[0-9+ -]{7,15}$/, "Invalid phone number.").optional().or(z.literal("").transform(() => undefined));

const userSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("student"), full_name: z.string().trim().min(2, "Enter a name.").max(120), email: accountEmail, roll_no: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,20}$/, "Roll number must be 4-20 letters/numbers."), course_id: z.uuid("Select a course."), semester: z.coerce.number().int().min(1).max(12), phone }),
  z.object({ role: z.enum(["teacher", "hod"]), full_name: z.string().trim().min(2, "Enter a name.").max(120), email: accountEmail, department_id: z.uuid("Select a department.") }),
  z.object({ role: z.literal("admin"), full_name: z.string().trim().min(2, "Enter a name.").max(120), email: accountEmail }),
], { error: "Select a role." });

export async function createUser(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const parsed = parseForm(userSchema, fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const db = admin();

  if (d.role === "student") {
    const { data: c } = await db.from("courses").select("total_semesters").eq("id", d.course_id).maybeSingle();
    if (!c) return fail("Course not found.");
    if (d.semester > c.total_semesters) return fail(`This course has only ${c.total_semesters} semesters.`, { semester: ["Semester is too high."] });
  }
  if (d.role === "hod" && (await activeHodExists(d.department_id))) return fail("This department already has an active HOD. Disable that account first or make them a teacher.");

  const res = await createUserAccount({
    role: d.role,
    email: d.email.toLowerCase(),
    fullName: d.full_name,
    rollNo: d.role === "student" ? d.roll_no : undefined,
    courseId: d.role === "student" ? d.course_id : undefined,
    semester: d.role === "student" ? d.semester : undefined,
    phone: d.role === "student" ? d.phone : undefined,
    departmentId: d.role === "teacher" || d.role === "hod" ? d.department_id : undefined,
  });
  if (!res.ok) return fail(res.error);
  await audit({ userId: actor.id, action: "user.create", entity: "user", entityId: res.id, details: { role: d.role, email: d.email } });
  revalidatePath("/admin/users");
  return { ok: true, message: `Account created for ${d.full_name}. The temporary password is shown only now; share it securely. It must be changed on first login.`, data: { credentials: [{ name: d.full_name, email: d.email.toLowerCase(), rollNo: d.role === "student" ? d.roll_no : "", password: res.password }] } };
}

const idSchema = z.object({ user_id: z.uuid() });

export async function toggleUserActive(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const parsed = parseForm(idSchema.extend({ active: z.enum(["true", "false"]) }), fd);
  if (!parsed.ok) return parsed.state;
  const { user_id } = parsed.data;
  const active = parsed.data.active === "true";
  if (user_id === actor.id) return fail("You cannot disable your own account.");
  const db = admin();
  const { data: target } = await db.from("users").select("role,teachers(department_id)").eq("id", user_id).maybeSingle();
  if (!target) return fail("User not found.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dep = (target.teachers as any)?.department_id;
  if (active && target.role === "hod" && dep && (await activeHodExists(dep, user_id))) return fail("This department already has an active HOD.");
  // Ban in Supabase Auth so old tokens stop working
  const { error } = await db.auth.admin.updateUserById(user_id, { ban_duration: active ? "none" : "876000h" });
  if (error) return fail("Could not update Auth.");
  await db.from("users").update({ is_active: active }).eq("id", user_id);
  await audit({ userId: actor.id, action: active ? "user.enable" : "user.disable", entity: "user", entityId: user_id });
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${user_id}`);
  return succeed(active ? "Account enabled." : "Account disabled and sign-in blocked.");
}

export async function resetUserPassword(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const parsed = parseForm(idSchema, fd);
  if (!parsed.ok) return parsed.state;
  const db = admin();
  const { data: u } = await db.from("users").select("email,full_name,students(univ_roll_no)").eq("id", parsed.data.user_id).maybeSingle();
  if (!u) return fail("User not found.");
  const password = tempPassword();
  const { error } = await db.auth.admin.updateUserById(parsed.data.user_id, { password });
  if (error) return fail("Could not reset the password.");
  await db.from("users").update({ must_change_password: true }).eq("id", parsed.data.user_id);
  await audit({ userId: actor.id, action: "user.password_reset", entity: "user", entityId: parsed.data.user_id });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roll = (u.students as any)?.univ_roll_no ?? "";
  return { ok: true, message: "A new temporary password has been generated (shown only now).", data: { credentials: [{ name: u.full_name, email: u.email, rollNo: roll, password }] } };
}

const updateSchema = z.object({
  user_id: z.uuid(),
  full_name: z.string().trim().min(2, "Enter a name.").max(120),
  semester: z.coerce.number().int().min(1).max(12).optional(),
  course_id: z.uuid().optional(),
  department_id: z.uuid().optional(),
  phone,
});

export async function updateUser(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const parsed = parseForm(updateSchema, fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const db = admin();
  const { data: u } = await db.from("users").select("role").eq("id", d.user_id).maybeSingle();
  if (!u) return fail("User not found.");

  await db.from("users").update({ full_name: d.full_name }).eq("id", d.user_id);
  if (u.role === "student") {
    const patch: Record<string, unknown> = { name: d.full_name, phone: d.phone ?? null };
    if (d.semester) patch.semester = d.semester;
    if (d.course_id) {
      const { data: c } = await db.from("courses").select("total_semesters").eq("id", d.course_id).maybeSingle();
      if (!c || (d.semester ?? 1) > c.total_semesters) return fail("Invalid course or semester.");
      patch.course_id = d.course_id;
    }
    const { error } = await db.from("students").update(patch).eq("user_id", d.user_id);
    if (error) return fail("Could not update the student.");
  } else if (u.role === "teacher" || u.role === "hod") {
    const patch: Record<string, unknown> = { name: d.full_name };
    if (d.department_id) {
      if (u.role === "hod" && (await activeHodExists(d.department_id, d.user_id))) return fail("That department already has an HOD.");
      patch.department_id = d.department_id;
    }
    await db.from("teachers").update(patch).eq("user_id", d.user_id);
  }
  await audit({ userId: actor.id, action: "user.update", entity: "user", entityId: d.user_id, details: { semester: d.semester, course: d.course_id, department: d.department_id } });
  revalidatePath(`/admin/users/${d.user_id}`);
  revalidatePath("/admin/users");
  return succeed("Details updated.");
}

/* ----------------------------- BULK IMPORT ----------------------------- */
const bulkSchema = z.object({
  role: z.enum(["student", "teacher", "hod"]),
  course_id: z.union([z.uuid(), z.literal("")]).optional(),
  department_id: z.union([z.uuid(), z.literal("")]).optional(),
});
const MAX_BULK = 200;

type BulkRow = { line: number; name: string; email: string; roll?: string; semester?: number; phone?: string; error?: string };

export async function previewBulkUsers(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const parsed = parseForm(bulkSchema, fd);
  if (!parsed.ok) return parsed.state;
  const { role } = parsed.data;
  const db = admin();

  let course: { id: string; total_semesters: number } | null = null;
  let departmentId: string | null = null;
  if (role === "student") {
    if (!parsed.data.course_id) return fail("Select a course for students.", { course_id: ["Select a course."] });
    const { data } = await db.from("courses").select("id,total_semesters,department_id").eq("id", parsed.data.course_id).maybeSingle();
    if (!data) return fail("Course not found.");
    course = data;
    departmentId = data.department_id;
  } else {
    if (!parsed.data.department_id) return fail("Select a department.", { department_id: ["Select a department."] });
    departmentId = parsed.data.department_id;
  }

  const columns: Record<string, string[]> = { name: ["Name", "Full Name"], email: ["Email"] };
  if (role === "student") {
    columns.roll = ["University Roll No", "roll no"];
    columns.semester = ["Semester"];
  }
  let sheet;
  try {
    const f = fd.get("file");
    sheet = await readSheet(f instanceof File ? f : null, columns);
  } catch (e) {
    if (e instanceof SheetError) return fail(e.message);
    throw e;
  }
  if (sheet.rows.length > MAX_BULK) return fail(`Import a maximum of ${MAX_BULK} users at a time (currently ${sheet.rows.length}).`);
  if (sheet.rows.length > MAX_SHEET_ROWS) return fail("Too many rows.");

  const emails = sheet.rows.map((r) => r.cells.email.toLowerCase());
  const rolls = sheet.rows.map((r) => (r.cells.roll ?? "").toUpperCase()).filter(Boolean);
  const takenEmail = new Set<string>();
  const takenRoll = new Set<string>();
  for (const part of chunk(emails.filter(Boolean), 200)) {
    const { data } = await db.from("users").select("email").in("email", part);
    for (const r of data ?? []) takenEmail.add(r.email.toLowerCase());
  }
  for (const part of chunk(rolls, 200)) {
    const { data } = await db.from("students").select("univ_roll_no").in("univ_roll_no", part);
    for (const r of data ?? []) takenRoll.add(r.univ_roll_no);
  }

  const seenE = new Set<string>();
  const seenR = new Set<string>();
  let hodCount = 0;
  const rows: BulkRow[] = sheet.rows.map(({ line, cells }) => {
    const row: BulkRow = { line, name: cells.name, email: cells.email.toLowerCase() };
    if (role === "student") {
      row.roll = (cells.roll ?? "").toUpperCase();
      row.semester = Number(cells.semester);
    }
    if (cells.name.length < 2 || cells.name.length > 120) row.error = "Name must be 2-120 characters";
    else if (!accountEmail.safeParse(row.email).success) row.error = `Email must end with ${EMAIL_DOMAIN_HINT}`;
    else if (takenEmail.has(row.email)) row.error = "This email is already registered";
    else if (seenE.has(row.email)) row.error = "Duplicate email in the sheet";
    else if (role === "student" && !/^[A-Z0-9]{4,20}$/.test(row.roll!)) row.error = "Roll number must be 4-20 letters/numbers";
    else if (role === "student" && takenRoll.has(row.roll!)) row.error = "This roll number already exists";
    else if (role === "student" && seenR.has(row.roll!)) row.error = "Duplicate roll number in the sheet";
    else if (role === "student" && (!Number.isInteger(row.semester) || row.semester! < 1 || row.semester! > course!.total_semesters)) row.error = `Semester must be between 1 and ${course!.total_semesters}`;
    else if (role === "hod" && ++hodCount > 1) row.error = "A department can have only one HOD";
    seenE.add(row.email);
    if (row.roll) seenR.add(row.roll);
    return row;
  });
  if (role === "hod" && (await activeHodExists(departmentId!)) ) rows.forEach((r) => (r.error ??= "This department already has an active HOD"));

  const ok = rows.filter((r) => !r.error).length;
  const file = fd.get("file") as File;
  const { data: log, error } = await db
    .from("upload_logs")
    .insert({ type: "users", uploaded_by: actor.id, department_id: departmentId, file_name: file.name.slice(0, 200), rows_total: rows.length, rows_ok: ok, rows_failed: rows.length - ok, meta: { role, course_id: course?.id ?? null, department_id: departmentId }, payload: rows, errors: rows.filter((r) => r.error).map((r) => ({ line: r.line, error: r.error })) })
    .select("id")
    .single();
  if (error || !log) return fail("Could not create the upload record.");
  redirect(`/admin/users?upload=${log.id}`);
}

export async function confirmBulkUsers(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireRole("admin");
  const parsed = parseForm(z.object({ upload_id: z.uuid() }), fd);
  if (!parsed.ok) return parsed.state;
  const db = admin();
  const { data: log } = await db.from("upload_logs").select("*").eq("id", parsed.data.upload_id).eq("uploaded_by", actor.id).eq("type", "users").maybeSingle();
  if (!log || log.status !== "previewed" || !log.payload) return fail("This upload can no longer be confirmed.");
  // Change status immediately to prevent a double submit
  const { data: locked } = await db.from("upload_logs").update({ status: "confirmed", confirmed_at: new Date().toISOString() }).eq("id", log.id).eq("status", "previewed").select("id");
  if (!locked?.length) return fail("This upload is already being processed.");

  const meta = log.meta as { role: "student" | "teacher" | "hod"; course_id: string | null; department_id: string };
  const rows = (log.payload as BulkRow[]).filter((r) => !r.error);
  const credentials: { name: string; email: string; rollNo: string; password: string }[] = [];
  const failed: string[] = [];

  for (const part of chunk(rows, 5)) {
    const results = await Promise.all(
      part.map((r) =>
        createUserAccount({ role: meta.role, email: r.email, fullName: r.name, rollNo: r.roll, courseId: meta.course_id ?? undefined, semester: r.semester, departmentId: meta.department_id }),
      ),
    );
    results.forEach((res, i) => {
      const r = part[i]!;
      if (res.ok) credentials.push({ name: r.name, email: r.email, rollNo: r.roll ?? "", password: res.password });
      else failed.push(`${r.email}: ${res.error}`);
    });
  }
  await db.from("upload_logs").update({ payload: null, rows_ok: credentials.length, rows_failed: log.rows_failed + failed.length }).eq("id", log.id);
  await audit({ userId: actor.id, action: "user.bulk_import", entity: "upload", entityId: log.id, details: { role: meta.role, created: credentials.length, failed: failed.length } });
  // NOTE: no revalidatePath here: the credentials must remain visible on this page.
  return {
    ok: failed.length === 0,
    message: `${credentials.length} accounts created.${failed.length ? `\nFailed: ${failed.slice(0, 8).join("; ")}` : ""}\nTemporary passwords are shown below; they will not be displayed again. Download the CSV and store it safely.`,
    data: { credentials },
  };
}
