"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { fail, parseForm, succeed, type ActionState } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { EXAM_LABEL, EXAM_TYPES, MAX_SHEET_ROWS, type ExamType } from "@/lib/constants";
import { notify } from "@/lib/notify";
import { getAllowedSubject, hodUserIds } from "@/lib/scope";
import { readSheet, SheetError } from "@/lib/sheets";
import { chunk } from "@/lib/utils";

export type MarksPreviewRow = {
  line: number;
  roll: string;
  name?: string;
  studentId?: string;
  marks?: number;
  max?: number;
  action?: "new" | "update";
  previous?: number;
  error?: string;
};

const COLUMNS = {
  roll: ["University Roll No", "univ roll no", "roll no", "roll"],
  subject: ["Subject Code", "subject"],
  exam: ["Exam Type", "exam"],
  marks: ["Marks Obtained", "marks"],
  max: ["Max Marks", "maximum marks", "max"],
};

const previewSchema = z.object({
  subject_id: z.uuid("Select a subject."),
  exam_type: z.enum(EXAM_TYPES, "Select an exam type."),
});

const num = (t: string): number | null => {
  if (!/^\d+(\.\d{1,2})?$/.test(t.trim())) return null;
  return Number(t);
};

/* ----------------------------- PREVIEW (validate) ----------------------------- */
export async function previewMarksUpload(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("teacher", "hod");
  const parsed = parseForm(previewSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { subject_id, exam_type } = parsed.data;

  const subject = await getAllowedSubject(user, subject_id);
  if (!subject) return fail("You do not have permission to upload marks for this subject.");

  let sheet;
  try {
    const f = formData.get("file");
    sheet = await readSheet(f instanceof File ? f : null, COLUMNS);
  } catch (e) {
    if (e instanceof SheetError) return fail(e.message);
    throw e;
  }

  const db = admin();
  const rolls = [...new Set(sheet.rows.map((r) => r.cells.roll.toUpperCase()).filter((r) => /^[A-Z0-9]{4,20}$/.test(r)))];
  const students = new Map<string, { id: string; name: string }>();
  for (const part of chunk(rolls, 300)) {
    const { data } = await db.from("students").select("id,name,univ_roll_no").eq("course_id", subject.course_id).in("univ_roll_no", part);
    for (const s of data ?? []) students.set(s.univ_roll_no, { id: s.id, name: s.name });
  }
  const existing = new Map<string, { marks: number; published: boolean }>();
  const ids = [...students.values()].map((s) => s.id);
  for (const part of chunk(ids, 300)) {
    const { data } = await db.from("marks").select("student_id,marks,is_published").eq("subject_id", subject_id).eq("exam_type", exam_type).in("student_id", part);
    for (const m of data ?? []) existing.set(m.student_id, { marks: Number(m.marks), published: m.is_published });
  }

  const seen = new Set<string>();
  const rows: MarksPreviewRow[] = sheet.rows.slice(0, MAX_SHEET_ROWS).map(({ line, cells }) => {
    const roll = cells.roll.toUpperCase();
    const row: MarksPreviewRow = { line, roll };
    const st = students.get(roll);
    const marks = num(cells.marks);
    const max = num(cells.max);

    if (!/^[A-Z0-9]{4,20}$/.test(roll)) row.error = "Invalid roll number";
    else if (!st) row.error = "No student with this roll number was found in this subject's course";
    else if (cells.subject.toUpperCase() !== subject.code.toUpperCase()) row.error = `Subject code must be ${subject.code}`;
    else if (cells.exam.toUpperCase().replace(/\s/g, "") !== exam_type) row.error = `Exam type must be ${exam_type}`;
    else if (marks === null) row.error = "Marks must be a number (e.g. 17.5)";
    else if (max === null || max <= 0 || max > 1000) row.error = "Max marks must be a number between 1 and 1000";
    else if (marks > max) row.error = "Marks exceed the max marks";
    else if (seen.has(roll)) row.error = "Duplicate roll number in the sheet";
    else {
      const ex = existing.get(st.id);
      if (ex?.published) row.error = "These marks are already published. Submit a correction request to make changes";
      else {
        row.studentId = st.id;
        row.name = st.name;
        row.marks = marks;
        row.max = max;
        row.action = ex ? "update" : "new";
        row.previous = ex?.marks;
      }
    }
    if (st) row.name = st.name;
    seen.add(roll);
    return row;
  });

  const ok = rows.filter((r) => !r.error).length;
  const file = formData.get("file") as File;
  const { data: log, error } = await db
    .from("upload_logs")
    .insert({
      type: "marks",
      uploaded_by: user.id,
      department_id: user.departmentId,
      file_name: file.name.slice(0, 200),
      rows_total: rows.length,
      rows_ok: ok,
      rows_failed: rows.length - ok,
      meta: { subject_id, subject_code: subject.code, subject_name: subject.name, exam_type },
      payload: rows,
      errors: rows.filter((r) => r.error).slice(0, 200).map((r) => ({ line: r.line, roll: r.roll, error: r.error })),
    })
    .select("id")
    .single();
  if (error || !log) return fail("Could not create the upload record. Please try again.");
  redirect(`/${user.role}/marks/upload?upload=${log.id}`);
}

/* ----------------------------- CONFIRM (save) ----------------------------- */
const confirmSchema = z.object({ upload_id: z.uuid() });

export async function confirmMarksUpload(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("teacher", "hod");
  const parsed = parseForm(confirmSchema, formData);
  if (!parsed.ok) return parsed.state;

  const db = admin();
  const { data: log } = await db.from("upload_logs").select("*").eq("id", parsed.data.upload_id).eq("uploaded_by", user.id).eq("type", "marks").maybeSingle();
  if (!log || log.status !== "previewed" || !log.payload) return fail("This upload can no longer be confirmed (already confirmed or discarded).");

  const meta = log.meta as { subject_id: string; exam_type: ExamType; subject_code: string };
  const subject = await getAllowedSubject(user, meta.subject_id); // re-authorize
  if (!subject) return fail("You no longer have permission for this subject.");

  const rows = (log.payload as MarksPreviewRow[]).filter((r) => !r.error && r.studentId);
  if (!rows.length) return fail("There are no valid rows.");

  // Race condition: if someone published after the preview, skip those rows
  const published = new Set<string>();
  for (const part of chunk(rows.map((r) => r.studentId!), 300)) {
    const { data } = await db.from("marks").select("student_id").eq("subject_id", meta.subject_id).eq("exam_type", meta.exam_type).eq("is_published", true).in("student_id", part);
    for (const m of data ?? []) published.add(m.student_id);
  }
  const toSave = rows.filter((r) => !published.has(r.studentId!));

  for (const part of chunk(toSave, 500)) {
    const { error } = await db.from("marks").upsert(
      part.map((r) => ({
        student_id: r.studentId!,
        subject_id: meta.subject_id,
        exam_type: meta.exam_type,
        marks: r.marks!,
        max_marks: r.max!,
        uploaded_by: user.id,
        updated_by: user.id,
        upload_id: log.id,
      })),
      { onConflict: "student_id,subject_id,exam_type" },
    );
    if (error) {
      await db.from("upload_logs").update({ status: "failed" }).eq("id", log.id);
      return fail("An error occurred while saving marks. Some rows may have been saved; please upload again and check.");
    }
  }

  await db.from("upload_logs").update({ status: "confirmed", confirmed_at: new Date().toISOString(), payload: null, rows_ok: toSave.length }).eq("id", log.id);
  await audit({
    userId: user.id,
    departmentId: user.departmentId,
    action: "marks.upload",
    entity: "upload",
    entityId: log.id,
    details: { subject: meta.subject_code, exam: meta.exam_type, saved: toSave.length, skipped: rows.length - toSave.length },
  });

  if (user.role === "teacher" && user.departmentId) {
    await notify(
      (await hodUserIds(user.departmentId)).map((id) => ({
        userId: id,
        title: "Marks uploaded",
        message: `${user.fullName} uploaded ${toSave.length} marks for ${meta.subject_code} ${EXAM_LABEL[meta.exam_type]}. Please review and publish them.`,
        link: "/hod/marks",
      })),
    );
  }
  revalidatePath("/hod/marks");
  redirect(user.role === "hod" ? "/hod/marks" : "/teacher/marks/history");
}

/* ----------------------------- PUBLISH / UNPUBLISH (HOD) ----------------------------- */
const batchSchema = z.object({ subject_id: z.uuid(), exam_type: z.enum(EXAM_TYPES) });

export async function publishBatch(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("hod");
  const parsed = parseForm(batchSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { subject_id, exam_type } = parsed.data;
  const subject = await getAllowedSubject(user, subject_id);
  if (!subject) return fail("This subject does not belong to your department.");

  const db = admin();
  const { data: updated, error } = await db
    .from("marks")
    .update({ is_published: true, published_at: new Date().toISOString(), published_by: user.id, updated_by: user.id })
    .eq("subject_id", subject_id)
    .eq("exam_type", exam_type)
    .eq("is_published", false)
    .select("student_id");
  if (error) return fail("Could not publish.");
  if (!updated?.length) return fail("No unpublished marks were found to publish.");

  // Notify students (student -> user id)
  const { data: studs } = await db.from("students").select("user_id").in("id", updated.map((u) => u.student_id));
  await notify(
    (studs ?? []).map((s) => ({
      userId: s.user_id,
      title: "Marks published",
      message: `Marks for ${subject.name} (${subject.code}) ${EXAM_LABEL[exam_type]} have been published.`,
      link: "/student/marks",
      email: true,
    })),
  );
  await audit({ userId: user.id, departmentId: user.departmentId, action: "marks.publish", entity: "subject", entityId: subject_id, details: { exam: exam_type, count: updated.length } });
  revalidatePath("/hod/marks");
  return succeed(`Marks published for ${updated.length} students.`);
}

export async function unpublishBatch(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("hod");
  const parsed = parseForm(batchSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { subject_id, exam_type } = parsed.data;
  if (!(await getAllowedSubject(user, subject_id))) return fail("This subject does not belong to your department.");

  const { data, error } = await admin()
    .from("marks")
    .update({ is_published: false, published_at: null, published_by: null, updated_by: user.id })
    .eq("subject_id", subject_id)
    .eq("exam_type", exam_type)
    .eq("is_published", true)
    .select("id");
  if (error) return fail("Could not unpublish.");
  await audit({ userId: user.id, departmentId: user.departmentId, action: "marks.unpublish", entity: "subject", entityId: subject_id, details: { exam: exam_type, count: data?.length ?? 0 } });
  revalidatePath("/hod/marks");
  return succeed(`${data?.length ?? 0} marks were moved back to draft. The teacher can now upload again.`);
}

/* ----------------------------- CORRECTION REQUESTS ----------------------------- */
const requestSchema = z.object({
  roll_no: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,20}$/, "Enter a valid roll number."),
  subject_id: z.uuid("Select a subject."),
  exam_type: z.enum(EXAM_TYPES, "Select an exam type."),
  new_marks: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Marks must be a number."),
  reason: z.string().trim().min(5, "Write a reason of at least 5 characters.").max(500),
});

export async function requestCorrection(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("teacher");
  const parsed = parseForm(requestSchema, formData);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const subject = await getAllowedSubject(user, d.subject_id);
  if (!subject) return fail("This subject is not assigned to you.");

  const db = admin();
  const { data: st } = await db.from("students").select("id,name").eq("univ_roll_no", d.roll_no).eq("course_id", subject.course_id).maybeSingle();
  if (!st) return fail("No student with this roll number was found in this subject's course.");
  const { data: m } = await db.from("marks").select("id,max_marks,marks,is_published").eq("student_id", st.id).eq("subject_id", d.subject_id).eq("exam_type", d.exam_type).maybeSingle();
  if (!m) return fail("Marks have not been uploaded for this student in this exam.");
  if (!m.is_published) return fail("These marks are not published yet; you can upload them again directly.");
  const newMarks = Number(d.new_marks);
  if (newMarks > Number(m.max_marks)) return fail(`Marks cannot exceed the maximum (${m.max_marks}).`);
  if (newMarks === Number(m.marks)) return fail("The new marks are the same as the current ones.");

  const { error } = await db.from("marks_corrections").insert({ marks_id: m.id, requested_by: user.id, new_marks: newMarks, reason: d.reason });
  if (error) return fail(error.code === "23505" ? "A correction request is already pending for this entry." : "Could not save the request.");

  await notify(
    (await hodUserIds(user.departmentId!)).map((id) => ({
      userId: id,
      title: "Marks correction request",
      message: `${user.fullName}: ${st.name} (${d.roll_no}) ${subject.code} ${d.exam_type}: ${m.marks} -> ${newMarks}. Reason: ${d.reason}`,
      link: "/hod/marks",
    })),
  );
  await audit({ userId: user.id, departmentId: user.departmentId, action: "marks.correction_request", entity: "marks", entityId: m.id, details: { from: m.marks, to: newMarks } });
  revalidatePath("/teacher/marks/history");
  return succeed("Correction request sent to the HOD.");
}

const decideSchema = z.object({ correction_id: z.uuid(), decision: z.enum(["approved", "rejected"]) });

export async function decideCorrection(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("hod");
  const parsed = parseForm(decideSchema, formData);
  if (!parsed.ok) return parsed.state;
  const db = admin();

  const { data: c } = await db.from("marks_corrections").select("*, marks(id,student_id,subject_id,exam_type,marks)").eq("id", parsed.data.correction_id).maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = c?.marks;
  if (!c || c.status !== "pending" || !m) return fail("This request is no longer pending.");
  const subject = await getAllowedSubject(user, m.subject_id);
  if (!subject) return fail("This request does not belong to your department.");

  if (parsed.data.decision === "approved") {
    const { error } = await db.from("marks").update({ marks: c.new_marks, updated_by: user.id }).eq("id", m.id); // trigger writes history
    if (error) return fail("Could not update the marks (they may exceed the max marks).");
  }
  await db.from("marks_corrections").update({ status: parsed.data.decision, decided_by: user.id, decided_at: new Date().toISOString() }).eq("id", c.id);

  const { data: stu } = await db.from("students").select("user_id").eq("id", m.student_id).single();
  const approved = parsed.data.decision === "approved";
  await notify([
    { userId: c.requested_by, title: `Correction ${approved ? "approved" : "rejected"}`, message: `${subject.code} ${m.exam_type}: ${m.marks} -> ${c.new_marks}`, link: "/teacher/marks/history" },
    ...(approved && stu ? [{ userId: stu.user_id, title: "Your marks have been updated", message: `${subject.name} ${m.exam_type}: ${m.marks} to ${c.new_marks}.`, link: "/student/marks", email: true }] : []),
  ]);
  await audit({ userId: user.id, departmentId: user.departmentId, action: `marks.correction_${parsed.data.decision}`, entity: "marks", entityId: m.id, details: { from: m.marks, to: c.new_marks } });
  revalidatePath("/hod/marks");
  return succeed(approved ? "Correction approved and marks updated." : "Correction rejected.");
}
