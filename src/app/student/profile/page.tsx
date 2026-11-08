import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ButtonLink, Card, CardHeader, PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "My profile" };

export default async function StudentProfile() {
  const user = await requireRole("student");
  const supabase = await createClient();
  const { data: ss } = await supabase
    .from("student_sections")
    .select("semester,sections(name)")
    .eq("student_id", user.student!.id)
    .eq("semester", user.student!.semester)
    .maybeSingle();
  const { data: st } = await supabase.from("students").select("phone").eq("id", user.student!.id).single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const section = (ss?.sections as any)?.name as string | undefined;

  const rows: [string, string][] = [
    ["Name", user.fullName],
    ["University Roll No.", user.student!.rollNo],
    ["Email", user.email],
    ["Phone", st?.phone || "-"],
    ["Institute", user.instituteName ?? "-"],
    ["Department", user.departmentName ?? "-"],
    ["Course", `${user.student!.courseName} (${user.student!.courseCode})`],
    ["Semester", String(user.student!.semester)],
    ["Section (current semester)", section ?? "Not assigned yet"],
  ];

  return (
    <>
      <PageHeader kicker="Account" title="My profile" description="These details come from the college record. Contact your HOD / Admin for changes." />
      <Card className="max-w-2xl">
        <CardHeader title={user.fullName} subtitle={`Roll No. ${user.student!.rollNo}`} action={<ButtonLink href="/change-password" variant="ghost" size="sm"><KeyRound className="size-4" /> Change password</ButtonLink>} />
        <dl className="divide-y divide-line">
          {rows.map(([k, v]) => (
            <div key={k} className="grid gap-1 px-5 py-3 sm:grid-cols-[13rem_1fr]">
              <dt className="text-xs font-bold uppercase tracking-wider text-muted">{k}</dt>
              <dd className="text-sm font-medium text-navy-900">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  );
}
