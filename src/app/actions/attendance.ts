"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { fail, parseForm, type ActionState } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { ATTENDANCE_THRESHOLD, MAX_SHEET_ROWS } from "@/lib/constants";
import { isoWeekKey, todayIST } from "@/lib/data";
import { pageAll } from "@/lib/db";
import { parseDate } from "@/lib/dates";
import { notify } from "@/lib/notify";
import { departmentCourses, hodUserIds } from "@/lib/scope";
import { readSheet, SheetError } from "@/lib/sheets";
import { chunk, toNum } from "@/lib/utils";

export type AttendancePreviewRow = {
  line: number;
  roll: string;
  name?: string;
  subjectCode?: string;
  date?: string;
  status?: "present" | "absent";
  studentId?: string;
  subjectId?: string;
  action?: "new" | "update" | "same";
  error?: string;
};

const COLUMNS = {
  roll: ["University Roll No", "univ roll no", "roll no", "roll"],
  date: ["Date"],
  subject: ["Subject Code", "subject"],
  status: ["Present/Absent", "presentabsent", "status", "attendance"],
};

const isoDate = z.string().trim().refine((v) => parseDate(v) === v, "Choose a valid date.");
const previewSchema = z
  .object({
    from: isoDate,
    to: isoDate,
    section_id: z.union([z.uuid(), z.literal("")]).optional(),
  })
  .refine((v) => v.from <= v.to, { message: "From date must be before To date.", path: ["to"] });

const normStatus = (t: string): "present" | "absent" | null => {
  const v = t.trim().toLowerCase();
  if (["present", "p", "1", "yes", "y"].includes(v)) return "present";
  if (["absent", "a", "0", "no", "n"].includes(v)) return "absent";
  return null;
};

export async function previewAttendanceUpload(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("hod");
  const parsed = parseForm(previewSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { from, to } = parsed.data;
  const sectionId = parsed.data.section_id || null;
  const db = admin();

  const courses = await departmentCourses(user.departmentId!);
  const courseIds = courses.map((c) => c.id);
  if (!courseIds.length) return fail("Your department has no courses yet. Contact an admin.");

  let sectionMembers: Set<string> | null = null;
  if (sectionId) {
    const { data: sec } = await db.from("sections").select("id,course_id").eq("id", sectionId).maybeSingle();
    if (!sec || !courseIds.includes(sec.course_id)) return fail("This section does not belong to your department.");
    const { data: mem } = await db.from("student_sections").select("student_id").eq("section_id", sectionId).limit(5000);
    sectionMembers = new Set((mem ?? []).map((m) => m.student_id));
  }

  let sheet;
  try {
    const f = formData.get("file");
    sheet = await readSheet(f instanceof File ? f : null, COLUMNS);
  } catch (e) {
    if (e instanceof SheetError) return fail(e.message);
    throw e;
  }

  const { data: subs } = await db.from("subjects").select("id,code,course_id").in("course_id", courseIds);
  const subjectKey = new Map((subs ?? []).map((s) => [`${s.course_id}|${s.code.toUpperCase()}`, s.id]));

  const rolls = [...new Set(sheet.rows.map((r) => r.cells.roll.toUpperCase()).filter((r) => /^[A-Z0-9]{4,20}$/.test(r)))];
  const students = new Map<string, { id: string; name: string; course_id: string }>();
  for (const part of chunk(rolls, 300)) {
    const { data } = await db.from("students").select("id,name,univ_roll_no,course_id").in("course_id", courseIds).in("univ_roll_no", part);
    for (const s of data ?? []) students.set(s.univ_roll_no, { id: s.id, name: s.name, course_id: s.course_id });
  }

  // Existing attendance (same student + subject + date)
  const existing = new Map<string, string>();
  for (const part of chunk([...students.values()].map((s) => s.id), 100)) {
    const rows = await pageAll<{ student_id: string; subject_id: string; date: string; status: string }>((a, b) =>
      db.from("attendance").select("student_id,subject_id,date,status").in("student_id", part).gte("date", from).lte("date", to).range(a, b),
    );
    for (const r of rows) existing.set(`${r.student_id}|${r.subject_id}|${r.date}`, r.status);
  }

  const today = todayIST();
  const seen = new Set<string>();
  const out: AttendancePreviewRow[] = [];
  let skipped = 0;

  for (const { line, cells } of sheet.rows.slice(0, MAX_SHEET_ROWS)) {
    // Empty status = no class that day / not filled in yet: skip the row
    if (!cells.status.trim() && cells.roll) {
      skipped++;
      continue;
    }
    const roll = cells.roll.toUpperCase();
    const row: AttendancePreviewRow = { line, roll, subjectCode: cells.subject.toUpperCase() };
    const st = students.get(roll);
    const date = parseDate(cells.date);
    const status = normStatus(cells.status);
    row.date = date ?? cells.date;

    if (!/^[A-Z0-9]{4,20}$/.test(roll)) row.error = "Invalid roll number";
    else if (!st) row.error = "No student with this roll number was found in your department";
    else if (sectionMembers && !sectionMembers.has(st.id)) row.error = "This student is not in the selected section";
    else {
      row.name = st.name;
      const subjectId = subjectKey.get(`${st.course_id}|${row.subjectCode}`);
      if (!subjectId) row.error = `Subject code ${cells.subject || "(empty)"} is not part of this student's course`;
      else if (!date) row.error = "Invalid date (YYYY-MM-DD or DD-MM-YYYY)";
      else if (date < from || date > to) row.error = "Date is outside the selected range";
      else if (date > today) row.error = "Attendance cannot be marked for a future date";
      else if (!status) row.error = "Enter Present or Absent";
      else {
        const key = `${st.id}|${subjectId}|${date}`;
        if (seen.has(key)) row.error = "Duplicate row: the same student, subject and date appears again";
        else {
          row.studentId = st.id;
          row.subjectId = subjectId;
          row.status = status;
          const prev = existing.get(key);
          row.action = !prev ? "new" : prev === status ? "same" : "update";
        }
        seen.add(key);
      }
    }
    out.push(row);
  }
  if (!out.length) return fail(skipped ? "All rows have an empty Present/Absent field; nothing to upload." : "No rows found.");

  const ok = out.filter((r) => !r.error).length;
  const file = formData.get("file") as File;
  const { data: log, error } = await db
    .from("upload_logs")
    .insert({
      type: "attendance",
      uploaded_by: user.id,
      department_id: user.departmentId,
      file_name: file.name.slice(0, 200),
      rows_total: out.length,
      rows_ok: ok,
      rows_failed: out.length - ok,
      meta: { from, to, section_id: sectionId, skipped },
      payload: out,
      errors: out.filter((r) => r.error).slice(0, 200).map((r) => ({ line: r.line, roll: r.roll, error: r.error })),
    })
    .select("id")
    .single();
  if (error || !log) return fail("Could not create the upload record. Please try again.");
  redirect(`/hod/attendance/upload?upload=${log.id}`);
}

const confirmSchema = z.object({ upload_id: z.uuid() });

export async function confirmAttendanceUpload(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("hod");
  const parsed = parseForm(confirmSchema, formData);
  if (!parsed.ok) return parsed.state;
  const db = admin();

  const { data: log } = await db.from("upload_logs").select("*").eq("id", parsed.data.upload_id).eq("uploaded_by", user.id).eq("type", "attendance").maybeSingle();
  if (!log || log.status !== "previewed" || !log.payload) return fail("This upload can no longer be confirmed (already confirmed or discarded).");

  const rows = (log.payload as AttendancePreviewRow[]).filter((r) => !r.error && r.studentId && r.subjectId && r.date && r.status);
  if (!rows.length) return fail("There are no valid rows.");

  for (const part of chunk(rows, 500)) {
    const { error } = await db.from("attendance").upsert(
      part.map((r) => ({ student_id: r.studentId!, subject_id: r.subjectId!, date: r.date!, status: r.status!, uploaded_by: user.id, upload_id: log.id })),
      { onConflict: "student_id,subject_id,date" },
    );
    if (error) {
      await db.from("upload_logs").update({ status: "failed" }).eq("id", log.id);
      return fail("An error occurred while saving attendance. Please upload again and check.");
    }
  }
  await db.from("upload_logs").update({ status: "confirmed", confirmed_at: new Date().toISOString(), payload: null }).eq("id", log.id);
  await audit({ userId: user.id, departmentId: user.departmentId, action: "attendance.upload", entity: "upload", entityId: log.id, details: { rows: rows.length, file: log.file_name } });

  // ---- Alert students below 75% (student + HOD) ----
  try {
    const studentIds = [...new Set(rows.map((r) => r.studentId!))];
    const low = new Map<string, { code: string; pct: number }[]>();
    const subjIds = [...new Set(rows.map((r) => r.subjectId!))];
    const { data: subs } = await db.from("subjects").select("id,code").in("id", subjIds);
    const code = new Map((subs ?? []).map((s) => [s.id, s.code]));
    for (const part of chunk(studentIds, 100)) {
      const sums = await pageAll<{ student_id: string; subject_id: string; percentage: number }>((a, b) =>
        db.from("attendance_summary").select("student_id,subject_id,percentage").in("student_id", part).in("subject_id", subjIds).lt("percentage", ATTENDANCE_THRESHOLD).range(a, b),
      );
      for (const s of sums) {
        const arr = low.get(s.student_id) ?? [];
        arr.push({ code: code.get(s.subject_id) ?? "?", pct: toNum(s.percentage) });
        low.set(s.student_id, arr);
      }
    }
    if (low.size) {
      const { data: users } = await db.from("students").select("id,user_id").in("id", [...low.keys()]);
      const week = isoWeekKey();
      await notify([
        ...(users ?? []).map((u) => ({
          userId: u.user_id,
          title: `Attendance is below ${ATTENDANCE_THRESHOLD}%`,
          message: low.get(u.id)!.map((l) => `${l.code} (${l.pct.toFixed(1)}%)`).join(", ") + ". Please attend your classes regularly.",
          link: "/student/attendance",
          dedupeKey: `low_att:${week}`, // one alert per week
          email: true,
        })),
        ...(await hodUserIds(user.departmentId!)).map((id) => ({
          userId: id,
          title: "Low attendance alert",
          message: `After this upload, ${low.size} students are below ${ATTENDANCE_THRESHOLD}% in one or more subjects.`,
          link: "/hod/attendance/reports",
        })),
      ]);
    }
  } catch (e) {
    console.error("[attendance alerts]", e);
  }

  revalidatePath("/hod/dashboard");
  redirect("/hod/attendance/reports");
}
