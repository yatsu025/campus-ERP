import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { strParam, isUuid } from "@/lib/utils";
import { assignSubject, createCourse, createDepartment, createSubject, unassignSubject } from "../actions";
import { ActionForm, Field, SubmitButton } from "@/components/ui/form";
import { Card, CardHeader, EmptyState, PageHeader, TableWrap } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Courses & subjects" };

export default async function Academics({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole("admin");
  const sp = await searchParams;
  const supabase = await createClient();
  const deptFilter = isUuid(strParam(sp.dept, 40)) ? strParam(sp.dept, 40) : "";

  const [{ data: institutes }, { data: departments }, { data: courses }] = await Promise.all([
    supabase.from("institutes").select("id,name").order("name"),
    supabase.from("departments").select("id,name,institute_id,institutes(name)").order("name"),
    supabase.from("courses").select("id,code,name,total_semesters,department_id,departments(name)").order("code"),
  ]);
  const visibleCourses = (courses ?? []).filter((c) => !deptFilter || c.department_id === deptFilter);
  const courseIds = visibleCourses.map((c) => c.id);
  const [{ data: subjects }, { data: teachers }] = await Promise.all([
    courseIds.length ? supabase.from("subjects").select("id,code,name,semester,course_id,courses(code,department_id)").in("course_id", courseIds).order("semester").order("code").limit(500) : Promise.resolve({ data: [] }),
    (deptFilter ? supabase.from("teachers").select("id,name,department_id,user_id").eq("department_id", deptFilter) : supabase.from("teachers").select("id,name,department_id,user_id")).order("name"),
  ]);
  const subjIds = (subjects ?? []).map((s) => s.id);
  const { data: assigns } = subjIds.length ? await supabase.from("teacher_subjects").select("teacher_id,subject_id,teachers(name),subjects(code,name)").in("subject_id", subjIds) : { data: [] };

  const depOpts = (departments ?? []).map((d) => ({ value: d.id, label: `${d.name} (${(d.institutes as unknown as { name: string } | null)?.name ?? ""})` }));

  return (
    <>
      <PageHeader kicker="Setup" title="Courses & subjects" description="First a department, then a course, then a subject. Once the subject is created, assign it to a teacher." />
      <form method="get" className="mb-5 flex flex-wrap items-center gap-2">
        <select name="dept" className="input !w-auto min-w-64" defaultValue={deptFilter}>
          <option value="">All departments</option>
          {depOpts.map((d) => (<option key={d.value} value={d.value}>{d.label}</option>))}
        </select>
        <button className="btn btn-ghost">Filter</button>
      </form>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader title="New department" />
          <div className="p-5">
            <ActionForm action={createDepartment} resetOnSuccess>
              <Field name="institute_id" as="select" label="Institute" required options={(institutes ?? []).map((i) => ({ value: i.id, label: i.name }))} />
              <Field name="name" label="Department name" placeholder="Computer Applications" required />
              <SubmitButton>Add</SubmitButton>
            </ActionForm>
          </div>
        </Card>
        <Card>
          <CardHeader title="New course" />
          <div className="p-5">
            <ActionForm action={createCourse} resetOnSuccess>
              <Field name="department_id" as="select" label="Department" required options={depOpts} />
              <div className="grid grid-cols-2 gap-3">
                <Field name="code" label="Code" placeholder="BCA" required />
                <Field name="total_semesters" label="Semesters" type="number" min={1} max={12} defaultValue={6} required />
              </div>
              <Field name="name" label="Course name" placeholder="Bachelor of Computer Applications" required />
              <SubmitButton>Add</SubmitButton>
            </ActionForm>
          </div>
        </Card>
        <Card>
          <CardHeader title="New subject" />
          <div className="p-5">
            <ActionForm action={createSubject} resetOnSuccess>
              <Field name="course_id" as="select" label="Course" required options={visibleCourses.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }))} />
              <div className="grid grid-cols-2 gap-3">
                <Field name="code" label="Subject code" required />
                <Field name="semester" label="Semester" type="number" min={1} max={12} required />
              </div>
              <Field name="name" label="Subject name" required />
              <SubmitButton>Add</SubmitButton>
            </ActionForm>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={`Courses (${visibleCourses.length})`} />
          {visibleCourses.length ? (
            <TableWrap>
              <thead><tr><th className="th">Code</th><th className="th">Course</th><th className="th">Department</th><th className="th">Sem</th></tr></thead>
              <tbody>
                {visibleCourses.map((c) => (
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  <tr key={c.id}><td className="td font-semibold text-navy-900">{c.code}</td><td className="td">{c.name}</td><td className="td text-xs">{(c.departments as any)?.name}</td><td className="td">{c.total_semesters}</td></tr>
                ))}
              </tbody>
            </TableWrap>
          ) : (
            <EmptyState title="No courses yet" text="Create a department and course first." />
          )}
        </Card>

        <Card>
          <CardHeader title="Assign a subject to a teacher" />
          <div className="p-5">
            <ActionForm action={assignSubject} resetOnSuccess>
              <Field name="teacher_id" as="select" label="Teacher / HOD" required options={(teachers ?? []).map((t) => ({ value: t.id, label: t.name }))} />
              <Field name="subject_id" as="select" label="Subject" required options={(subjects ?? []).map((s) => ({ value: s.id, label: `${(s.courses as unknown as { code: string } | null)?.code} · Sem ${s.semester} · ${s.code} ${s.name}` }))} />
              <SubmitButton>Assign</SubmitButton>
            </ActionForm>
          </div>
          {!!assigns?.length && (
            <ul className="divide-y divide-line border-t border-line">
              {assigns.map((a) => (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                <li key={`${a.teacher_id}${a.subject_id}`} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm"><span><b className="text-navy-900">{(a.teachers as any)?.name}</b> → {(a.subjects as any)?.code} {(a.subjects as any)?.name}</span>
                  <ActionForm action={unassignSubject} className="!space-y-0"><input type="hidden" name="teacher_id" value={a.teacher_id} /><input type="hidden" name="subject_id" value={a.subject_id} /><SubmitButton variant="danger" size="sm">Remove</SubmitButton></ActionForm></li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title={`Subjects (${subjects?.length ?? 0})`} />
        {subjects?.length ? (
          <TableWrap>
            <thead><tr><th className="th">Code</th><th className="th">Subject</th><th className="th">Course</th><th className="th">Sem</th></tr></thead>
            <tbody>
              {subjects.map((s) => (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                <tr key={s.id}><td className="td font-semibold text-navy-900">{s.code}</td><td className="td">{s.name}</td><td className="td">{(s.courses as any)?.code}</td><td className="td">{s.semester}</td></tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <EmptyState title="No subjects yet" />
        )}
      </Card>
    </>
  );
}
