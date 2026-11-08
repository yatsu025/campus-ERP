import type { SessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { admin } from "@/lib/supabase/admin";
import { pageAll } from "@/lib/db";
import { fmtDateTime } from "@/lib/utils";
import { assignStudents, createSection } from "@/app/actions/sections";
import { ActionForm, Field, SubmitButton } from "@/components/ui/form";
import { Card, CardHeader, EmptyState, TableWrap } from "@/components/ui/primitives";

/** Same Section Management for HOD (their own department) and Admin (all) */
export async function SectionsManager({ user }: { user: SessionUser }) {
  const supabase = await createClient();
  let cq = supabase.from("courses").select("id,code,name,total_semesters").order("code");
  if (user.role === "hod") cq = cq.eq("department_id", user.departmentId!);
  const { data: courses } = await cq;
  const courseIds = (courses ?? []).map((c) => c.id);
  const cMap = new Map((courses ?? []).map((c) => [c.id, c]));

  const { data: sections } = courseIds.length ? await supabase.from("sections").select("id,name,semester,course_id").in("course_id", courseIds).order("semester").order("name") : { data: [] };
  const secIds = (sections ?? []).map((s) => s.id);
  const members = secIds.length ? await pageAll<{ section_id: string }>((a, b) => supabase.from("student_sections").select("section_id").in("section_id", secIds).range(a, b)) : [];
  const count = new Map<string, number>();
  for (const m of members) count.set(m.section_id, (count.get(m.section_id) ?? 0) + 1);

  const { data: history } = await supabase.from("audit_logs").select("id,user_id,details,created_at").eq("action", "section.assign").order("created_at", { ascending: false }).limit(30);
  const actorIds = [...new Set((history ?? []).map((h) => h.user_id).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length ? await admin().from("users").select("id,full_name").in("id", actorIds) : { data: [] };
  const actorName = new Map((actors ?? []).map((a) => [a.id, a.full_name]));

  const secLabel = (s: { course_id: string; semester: number; name: string }) => `${cMap.get(s.course_id)?.code} · Sem ${s.semester} · Section ${s.name}`;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="New section" subtitle="A section is only a grouping. Attendance is linked by roll number." />
          <div className="p-5">
            <ActionForm action={createSection} resetOnSuccess>
              <Field name="course_id" as="select" label="Course" required options={(courses ?? []).map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }))} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field name="semester" label="Semester" type="number" min={1} max={12} required />
                <Field name="name" label="Section name" placeholder="A" required />
              </div>
              <SubmitButton>Create section</SubmitButton>
            </ActionForm>
          </div>
        </Card>
        <Card>
          <CardHeader title="Assign students" subtitle="Paste roll numbers (separated by line, space or comma)" />
          <div className="p-5">
            <ActionForm action={assignStudents} resetOnSuccess>
              <Field name="section_id" as="select" label="Section" required options={(sections ?? []).map((s) => ({ value: s.id, label: secLabel(s) }))} />
              <Field name="rolls" as="textarea" rows={5} label="University Roll Numbers" placeholder={"97240065\n97240066"} required />
              <SubmitButton>Assign</SubmitButton>
            </ActionForm>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Sections" />
        {sections?.length ? (
          <TableWrap>
            <thead><tr><th className="th">Course</th><th className="th">Semester</th><th className="th">Section</th><th className="th">Students</th></tr></thead>
            <tbody>
              {sections.map((s) => (
                <tr key={s.id}><td className="td font-semibold text-navy-900">{cMap.get(s.course_id)?.code}</td><td className="td">{s.semester}</td><td className="td">{s.name}</td><td className="td">{count.get(s.id) ?? 0}</td></tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <EmptyState title="No sections yet" text="Create the first section above." />
        )}
      </Card>

      <Card>
        <CardHeader title="Change history" subtitle="Which student moved to which section and when" />
        {history?.length ? (
          <TableWrap>
            <thead><tr><th className="th">When</th><th className="th">Roll No.</th><th className="th">Semester</th><th className="th">Section</th><th className="th">By</th></tr></thead>
            <tbody>
              {history.map((h) => {
                const d = h.details as { roll: string; semester: number; from: string | null; to: string };
                return (
                  <tr key={h.id}>
                    <td className="td text-xs text-muted">{fmtDateTime(h.created_at)}</td>
                    <td className="td font-semibold text-navy-900">{d.roll}</td>
                    <td className="td">{d.semester}</td>
                    <td className="td">{d.from ?? "-"} → <b>{d.to}</b></td>
                    <td className="td text-xs">{h.user_id ? actorName.get(h.user_id) ?? "-" : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        ) : (
          <EmptyState title="No changes yet" />
        )}
      </Card>
    </div>
  );
}
