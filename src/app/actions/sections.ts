"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { fail, parseForm, succeed, type ActionState } from "@/lib/action";
import { requireRole, type SessionUser } from "@/lib/auth";
import { chunk } from "@/lib/utils";

async function courseAllowed(user: SessionUser, courseId: string): Promise<{ departmentId: string } | null> {
  const { data } = await admin().from("courses").select("department_id").eq("id", courseId).maybeSingle();
  if (!data) return null;
  if (user.role === "hod" && data.department_id !== user.departmentId) return null;
  return { departmentId: data.department_id };
}

const createSchema = z.object({
  course_id: z.uuid("Select a course."),
  semester: z.coerce.number().int().min(1, "Semester must be between 1 and 12.").max(12, "Semester must be between 1 and 12."),
  name: z.string().trim().min(1, "Enter the section name.").max(20).regex(/^[A-Za-z0-9 -]+$/, "Name may contain only letters, numbers, spaces or -."),
});

export async function createSection(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("hod", "admin");
  const parsed = parseForm(createSchema, formData);
  if (!parsed.ok) return parsed.state;
  if (!(await courseAllowed(user, parsed.data.course_id))) return fail("This course does not belong to your department.");
  const { error } = await admin().from("sections").insert(parsed.data);
  if (error) return fail(error.code === "23505" ? "A section already exists for this course and semester." : "Could not create the section.");
  revalidatePath("/hod/sections");
  revalidatePath("/admin/sections");
  return succeed("Section created.");
}

const assignSchema = z.object({
  section_id: z.uuid("Select a section."),
  rolls: z.string().min(1, "Enter roll numbers.").max(20000),
});

export async function assignStudents(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("hod", "admin");
  const parsed = parseForm(assignSchema, formData);
  if (!parsed.ok) return parsed.state;

  const db = admin();
  const { data: sec } = await db.from("sections").select("id,name,semester,course_id").eq("id", parsed.data.section_id).maybeSingle();
  if (!sec) return fail("Section not found.");
  const scope = await courseAllowed(user, sec.course_id);
  if (!scope) return fail("This section does not belong to your department.");

  const all = parsed.data.rolls.split(/[\s,;]+/).map((r) => r.trim().toUpperCase()).filter(Boolean);
  const rolls = [...new Set(all)];
  const invalid = rolls.filter((r) => !/^[A-Z0-9]{4,20}$/.test(r));
  if (invalid.length) return fail(`These roll numbers have an invalid format: ${invalid.slice(0, 8).join(", ")}`);
  if (rolls.length > 500) return fail("A maximum of 500 roll numbers at a time.");

  const found: { id: string; univ_roll_no: string; semester: number }[] = [];
  for (const part of chunk(rolls, 300)) {
    const { data } = await db.from("students").select("id,univ_roll_no,semester").eq("course_id", sec.course_id).in("univ_roll_no", part);
    found.push(...(data ?? []));
  }
  const byRoll = new Map(found.map((s) => [s.univ_roll_no, s]));
  const missing = rolls.filter((r) => !byRoll.has(r));
  const wrongSem = found.filter((s) => s.semester !== sec.semester);
  const ok = found.filter((s) => s.semester === sec.semester);
  if (!ok.length) return fail(`No students were assigned.${missing.length ? ` Not found in this course: ${missing.slice(0, 8).join(", ")}.` : ""}${wrongSem.length ? ` Not in Semester ${sec.semester}: ${wrongSem.slice(0, 8).map((s) => s.univ_roll_no).join(", ")}.` : ""}`);

  // What section were they already in?
  const prev = new Map<string, string>();
  for (const part of chunk(ok.map((s) => s.id), 300)) {
    const { data } = await db.from("student_sections").select("student_id,sections(name)").eq("semester", sec.semester).in("student_id", part);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of data ?? []) prev.set(r.student_id, (r.sections as any)?.name ?? "?");
  }

  const { error } = await db.from("student_sections").upsert(
    ok.map((s) => ({ student_id: s.id, section_id: sec.id, semester: sec.semester, assigned_by: user.id, assigned_at: new Date().toISOString() })),
    { onConflict: "student_id,semester" },
  );
  if (error) return fail("Could not assign.");

  // Change history (audit log): only those whose section actually changed or who were newly assigned
  const changed = ok.filter((s) => prev.get(s.id) !== sec.name);
  for (const part of chunk(changed, 300)) {
    await db.from("audit_logs").insert(
      part.map((s) => ({
        user_id: user.id,
        department_id: scope.departmentId,
        action: "section.assign",
        entity: "student",
        entity_id: s.id,
        details: { roll: s.univ_roll_no, semester: sec.semester, from: prev.get(s.id) ?? null, to: sec.name },
      })),
    );
  }
  revalidatePath("/hod/sections");
  revalidatePath("/admin/sections");
  const notes = [
    `${ok.length} students assigned to Section ${sec.name} (${changed.length} new/changed).`,
    missing.length ? `Not found in the course: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "…" : ""}` : "",
    wrongSem.length ? `Not in Semester ${sec.semester}: ${wrongSem.slice(0, 10).map((s) => s.univ_roll_no).join(", ")}` : "",
  ].filter(Boolean);
  return succeed(notes.join("\n"));
}
