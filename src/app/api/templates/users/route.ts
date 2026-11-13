import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { buildWorkbook, xlsxResponse } from "@/lib/sheets";
import { EMAIL_DOMAIN_HINT } from "@/lib/users";

export async function GET(req: NextRequest) {
  await requireRole("admin");
  const role = req.nextUrl.searchParams.get("role");
  if (role !== "student" && role !== "teacher" && role !== "hod") return new NextResponse("Bad request", { status: 400 });
  const student = role === "student";
  const buf = await buildWorkbook({
    sheetName: "Users",
    headers: student ? ["Name", "Email", "University Roll No", "Semester"] : ["Name", "Email"],
    rows: [],
    widths: [30, 34, 22, 12],
    notes: ["Instructions", "1. A maximum of 200 rows per upload.", `2. Emails must end with ${EMAIL_DOMAIN_HINT} and be unique. A student's roll number must also be unique.`, "3. Course / Department is chosen in the upload form, not in the sheet.", "4. After import, each user receives a temporary password; they must change it on first sign-in."],
  });
  return xlsxResponse(buf, `users-${role}-template.xlsx`);
}
