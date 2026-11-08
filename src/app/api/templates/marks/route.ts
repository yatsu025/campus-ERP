import { NextResponse, type NextRequest } from "next/server";
import { admin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { EXAM_TYPES } from "@/lib/constants";
import { getAllowedSubject } from "@/lib/scope";
import { buildWorkbook, xlsxResponse } from "@/lib/sheets";
import { isUuid } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const user = await requireRole("teacher", "hod");
  const subjectId = req.nextUrl.searchParams.get("subject") ?? "";
  const exam = req.nextUrl.searchParams.get("exam") ?? "";
  if (!isUuid(subjectId) || !(EXAM_TYPES as readonly string[]).includes(exam)) return new NextResponse("Bad request", { status: 400 });

  const subject = await getAllowedSubject(user, subjectId);
  if (!subject) return new NextResponse("Forbidden", { status: 403 });

  const { data: students } = await admin()
    .from("students")
    .select("univ_roll_no,name")
    .eq("course_id", subject.course_id)
    .eq("semester", subject.semester)
    .order("univ_roll_no")
    .limit(2000);

  const buf = await buildWorkbook({
    sheetName: "Marks",
    headers: ["University Roll No", "Student Name", "Subject Code", "Exam Type", "Marks Obtained", "Max Marks"],
    rows: (students ?? []).map((s) => [s.univ_roll_no, s.name, subject.code, exam, null, null]),
    widths: [20, 28, 16, 14, 16, 12],
    notes: [
      "Instructions",
      "1. Do not change the header row.",
      "2. Fill only 'Marks Obtained' and 'Max Marks'. 'Student Name' is just for your reference.",
      "3. Keep the Roll number, Subject Code and Exam Type exactly as they are.",
      "4. Marks that have already been published cannot be changed by upload (use a correction request).",
    ],
  });
  return xlsxResponse(buf, `marks-${subject.code}-${exam}.xlsx`);
}
