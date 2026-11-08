import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { AttendanceReportPanel } from "@/components/attendance-report-panel";
import { PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Attendance reports" };

export default async function HodAttendanceReports({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole("hod");
  return (
    <>
      <PageHeader kicker="Attendance" title="Attendance reports" description="Filter by subject or section. By default, only students below 75% are shown." />
      <AttendanceReportPanel user={user} searchParams={await searchParams} basePath="/hod/attendance/reports" />
    </>
  );
}
