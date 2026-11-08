import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { attendanceReport } from "@/lib/reports";
import { buildWorkbook, xlsxResponse } from "@/lib/sheets";
import { audit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const user = await requireRole("hod", "teacher", "admin");
  const p = req.nextUrl.searchParams;
  const view = p.get("view") === "all" ? "all" : "low";
  const { rows } = await attendanceReport({ subjectId: p.get("subject") ?? undefined, sectionId: p.get("section") ?? undefined, view });
  if (!rows) return new NextResponse("Error", { status: 500 });
  const buf = await buildWorkbook({
    sheetName: "Attendance report",
    headers: ["University Roll No", "Student", "Subject Code", "Subject", "Present", "Total", "Percentage"],
    rows: rows.map((r) => [r.roll, r.name, r.subject, r.subjectName, r.present, r.total, r.percentage]),
    widths: [20, 28, 14, 30, 10, 10, 12],
  });
  await audit({ userId: user.id, departmentId: user.departmentId, action: "attendance.export", details: { rows: rows.length, view } });
  return xlsxResponse(buf, `attendance-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
