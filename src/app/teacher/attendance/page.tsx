import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { AttendanceReportPanel } from "@/components/attendance-report-panel";
import { PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Attendance report" };

export default async function TeacherAttendance({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole("teacher");
  return (
    <>
      <PageHeader kicker="Attendance" title="Attendance report" description="Attendance for your subjects. View only; the HOD uploads attendance." />
      <AttendanceReportPanel user={user} searchParams={await searchParams} basePath="/teacher/attendance" />
    </>
  );
}
