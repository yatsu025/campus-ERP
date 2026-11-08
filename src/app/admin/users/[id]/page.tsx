import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, KeyRound, UserCheck, UserX } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL, type Role } from "@/lib/constants";
import { fmtDateTime, isUuid } from "@/lib/utils";
import { resetUserPassword, toggleUserActive, updateUser } from "../../actions";
import { ActionForm, CredentialsResult, Field, SubmitButton } from "@/components/ui/form";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Manage user" };

export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireRole("admin");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const { data: u } = await supabase.from("users").select("id,email,role,full_name,is_active,must_change_password,created_at,students(univ_roll_no,semester,course_id,phone),teachers(department_id)").eq("id", id).maybeSingle();
  if (!u) notFound();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const st: any = u.students; const t: any = u.teachers;
  const [{ data: courses }, { data: departments }] = await Promise.all([
    supabase.from("courses").select("id,code,name").order("code"),
    supabase.from("departments").select("id,name").order("name"),
  ]);

  return (
    <>
      <Link href="/admin/users" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-navy-800 hover:underline"><ArrowLeft className="size-4" /> All users</Link>
      <PageHeader kicker={ROLE_LABEL[u.role as Role]} title={u.full_name} description={`${u.email} · Joined ${fmtDateTime(u.created_at)}`} actions={<>{u.is_active ? <Badge tone="ok">Active</Badge> : <Badge tone="bad">Disabled</Badge>}{u.must_change_password && <Badge tone="warn">Password change pending</Badge>}</>} />

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader title="Edit details" subtitle={st ? `Roll No. ${st.univ_roll_no} (roll number cannot be changed)` : undefined} />
          <div className="p-5">
            <ActionForm action={updateUser}>
              <input type="hidden" name="user_id" value={u.id} />
              <Field name="full_name" label="Full name" defaultValue={u.full_name} required />
              {st && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field name="semester" label="Semester" type="number" min={1} max={12} defaultValue={st.semester} required />
                    <Field name="phone" label="Phone" defaultValue={st.phone ?? ""} />
                  </div>
                  <Field name="course_id" as="select" label="Course" defaultValue={st.course_id} options={(courses ?? []).map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }))} />
                </>
              )}
              {t && <Field name="department_id" as="select" label="Department" defaultValue={t.department_id} options={(departments ?? []).map((d) => ({ value: d.id, label: d.name }))} />}
              <SubmitButton>Save</SubmitButton>
            </ActionForm>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Password reset" subtitle="Generates a new temporary password; the user must change it on first login." />
            <div className="p-5">
              <ActionForm action={resetUserPassword}>
                <input type="hidden" name="user_id" value={u.id} />
                <SubmitButton variant="ghost"><KeyRound className="size-4" /> Generate temporary password</SubmitButton>
                <CredentialsResult />
              </ActionForm>
            </div>
          </Card>
          {u.id !== me.id && (
            <Card>
              <CardHeader title={u.is_active ? "Disable account" : "Enable account"} subtitle={u.is_active ? "Sign-in is blocked immediately. Data is preserved." : "The user will be able to sign in again."} />
              <div className="p-5">
                <ActionForm action={toggleUserActive}>
                  <input type="hidden" name="user_id" value={u.id} />
                  <input type="hidden" name="active" value={u.is_active ? "false" : "true"} />
                  <SubmitButton variant={u.is_active ? "danger" : "primary"}>{u.is_active ? <><UserX className="size-4" /> Disable</> : <><UserCheck className="size-4" /> Enable</>}</SubmitButton>
                </ActionForm>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
