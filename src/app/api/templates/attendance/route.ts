import { NextResponse, type NextRequest } from "next/server";
import { admin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { parseDate } from "@/lib/dates";
import { departmentCourses, getAllowedSubject } from "@/lib/scope";
import { buildWorkbook, xlsxResponse } from "@/lib/sheets";
import { MAX_SHEET_ROWS } from "@/lib/constants";
import { isUuid } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const user = await requireRole("hod");
  const p = req.nextUrl.searchParams;
  const section = p.get("section") ?? "";
  const subject = p.get("subject") ?? "";
  const from = parseDate(p.get("from") ?? "");
  const to = parseDate(p.get("to") ?? "");
  if (!isUuid(section) || !isUuid(subject) || !from || !to || from > to) return new NextResponse("Bad request", { status: 400 });

  const sub = await getAllowedSubject(user, subject);
  const courseIds = (await departmentCourses(user.departmentId!)).map((c) => c.id);
  const db = admin();
  const { data: sec } = await db.from("sections").select("id,course_id").eq("id", section).maybeSingle();
  if (!sub || !sec || !courseIds.includes(sec.course_id)) return new NextResponse("Forbidden", { status: 403 });

  const { data: mem } = await db.from("student_sections").select("students(univ_roll_no,name)").eq("section_id", section).limit(2000);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const students = (mem ?? []).map((m: any) => m.students).filter(Boolean).sort((a: any, b: any) => a.univ_roll_no.localeCompare(b.univ_roll_no));

  const dates: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`) && dates.length < 62; d = new Date(d.getTime() + 86400000)) {
    if (d.getUTCDay() !== 0) dates.push(d.toISOString().slice(0, 10)); // skip Sunday
  }
  const rows: (string | null)[][] = [];
  for (const dt of dates) for (const s of students) if (rows.length < MAX_SHEET_ROWS) rows.push([s.univ_roll_no, s.name, dt, sub.code, null]);

  const buf = await buildWorkbook({
    sheetName: "Attendance",
    headers: ["University Roll No", "Student Name", "Date", "Subject Code", "Present/Absent"],
    rows,
    dropdowns: [{ col: 5, list: ["Present", "Absent"] }],
    widths: [20, 28, 14, 16, 16],
    notes: [
      "Instructions",
      "1. Fill only the 'Present/Absent' column (choose Present or Absent from the dropdown).",
      "2. If there was no class that day, leave the cell blank: that row will be skipped.",
      "3. Do not change the Roll number, Date or Subject Code.",
      "4. Re-uploading attendance that was already uploaded will update it.",
    ],
  });
  return xlsxResponse(buf, `attendance-${sub.code}-${from}-to-${to}.xlsx`);
}
