import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PAGE_SIZE, ROLE_LABEL, type Role } from "@/lib/constants";
import { cn, fmtDate, isUuid, pageParam, safeLike, strParam } from "@/lib/utils";
import { EMAIL_DOMAIN_HINT } from "@/lib/users";
import { confirmBulkUsers, createUser, previewBulkUsers } from "../actions";
import { ActionForm, CredentialsResult, Field, SubmitButton } from "@/components/ui/form";
import { Alert, Badge, Card, CardHeader, DownloadLink, EmptyState, PageHeader, Pagination, TableWrap } from "@/components/ui/primitives";
import { UploadPreview } from "@/components/ui/upload-preview";

export const metadata: Metadata = { title: "Manage users" };
export const maxDuration = 60; // bulk import takes time to create Auth users

const ROLES = ["student", "teacher", "hod", "admin"] as const;

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole("admin");
  const sp = await searchParams;
  const supabase = await createClient();

  const uploadId = strParam(sp.upload, 40);
  if (isUuid(uploadId)) {
    const { data: log } = await supabase.from("upload_logs").select("id,file_name,rows_total,rows_ok,rows_failed,payload,status,meta").eq("id", uploadId).eq("type", "users").maybeSingle();
    const role = (log?.meta as { role?: string } | undefined)?.role;
    return (
      <>
        <PageHeader kicker="Users" title="Bulk import preview" description="As soon as you confirm, accounts will be created and each will receive a temporary password." />
        {log ? (
          <UploadPreview log={log} confirmAction={confirmBulkUsers} backPath="/admin/users" confirmLabel="Create accounts" columns={[{ key: "name", label: "Name" }, { key: "email", label: "Email" }, ...(role === "student" ? [{ key: "roll", label: "Roll No." }, { key: "semester", label: "Semester" }] : [])]} />
        ) : (
          <Alert tone="bad">This upload was not found.</Alert>
        )}
      </>
    );
  }

  const roleF = (ROLES as readonly string[]).includes(strParam(sp.role, 10)) ? strParam(sp.role, 10) : "";
  const q = safeLike(strParam(sp.q, 60));
  const page = pageParam(sp.page);

  let ids: string[] = [];
  if (q) {
    const { data } = await supabase.from("students").select("user_id").ilike("univ_roll_no", `%${q}%`).limit(50);
    ids = (data ?? []).map((s) => s.user_id);
  }
  let query = supabase.from("users").select("id,email,role,full_name,is_active,created_at,students(univ_roll_no,semester),teachers(departments(name))", { count: "exact" }).order("created_at", { ascending: false });
  if (roleF) query = query.eq("role", roleF);
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%${ids.length ? `,id.in.(${ids.join(",")})` : ""}`);
  const { data: users, count } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const [{ data: courses }, { data: departments }] = await Promise.all([
    supabase.from("courses").select("id,code,name,departments(name)").order("code"),
    supabase.from("departments").select("id,name").order("name"),
  ]);
  const courseOpts = (courses ?? []).map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }));
  const depOpts = (departments ?? []).map((d) => ({ value: d.id, label: d.name }));

  return (
    <>
      <PageHeader kicker="Users" title="Manage users" description="Only an Admin creates accounts. Each new user receives a temporary password that must be changed on first login." />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Add a user" subtitle="Fill in only the fields required for the role" />
          <div className="p-5">
            <ActionForm action={createUser} resetOnSuccess>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field name="role" as="select" label="Role" required options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r as Role] }))} />
                <Field name="full_name" label="Full name" required />
                <Field name="email" type="email" label="Email" required className="sm:col-span-2" hint={`Must end with ${EMAIL_DOMAIN_HINT}`} />
              </div>
              <fieldset className="rounded-lg border border-line p-4">
                <legend className="px-1 text-xs font-bold uppercase tracking-wider text-muted">For students only</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field name="roll_no" label="University Roll No." />
                  <Field name="semester" label="Semester" type="number" min={1} max={12} />
                  <Field name="course_id" as="select" label="Course" options={courseOpts} className="sm:col-span-2" />
                  <Field name="phone" label="Phone (optional)" inputMode="tel" />
                </div>
              </fieldset>
              <fieldset className="rounded-lg border border-line p-4">
                <legend className="px-1 text-xs font-bold uppercase tracking-wider text-muted">For teachers / HODs only</legend>
                <Field name="department_id" as="select" label="Department" options={depOpts} />
              </fieldset>
              <SubmitButton>Create account</SubmitButton>
              <CredentialsResult />
            </ActionForm>
          </div>
        </Card>

        <Card>
          <CardHeader title="Bulk import from Excel" subtitle="Max 200 users at a time" />
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap gap-2">
              <DownloadLink href="/api/templates/users?role=student">Student template</DownloadLink>
              <DownloadLink href="/api/templates/users?role=teacher">Teacher template</DownloadLink>
              <DownloadLink href="/api/templates/users?role=hod">HOD template</DownloadLink>
            </div>
            <ActionForm action={previewBulkUsers} encType="multipart/form-data">
              <Field name="role" as="select" label="User role" required options={[{ value: "student", label: "Students" }, { value: "teacher", label: "Teachers" }, { value: "hod", label: "HOD" }]} />
              <Field name="course_id" as="select" label="Course (for students)" options={courseOpts} />
              <Field name="department_id" as="select" label="Department (for teacher / HOD)" options={depOpts} />
              <Field name="file" label="Sheet" as="file" accept=".xlsx,.csv" required />
              <SubmitButton>Upload and preview</SubmitButton>
            </ActionForm>
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold text-navy-900">All users {count !== null && <span className="text-sm font-normal text-muted">({count})</span>}</h2>
          <form method="get" className="flex flex-wrap gap-2">
            <select name="role" defaultValue={roleF} className="input !w-auto">
              <option value="">All roles</option>
              {ROLES.map((r) => (<option key={r} value={r}>{ROLE_LABEL[r as Role]}</option>))}
            </select>
            <input name="q" defaultValue={q} placeholder="Name, email, roll no." className="input !w-52" />
            <button className="btn btn-ghost">Search</button>
          </form>
        </div>
        {users?.length ? (
          <>
            <TableWrap>
              <thead><tr><th className="th">Name</th><th className="th">Role</th><th className="th">Roll / Dept</th><th className="th">Status</th><th className="th">Joined</th><th className="th" /></tr></thead>
              <tbody>
                {users.map((u) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const st: any = u.students; const t: any = u.teachers;
                  return (
                    <tr key={u.id} className={cn(!u.is_active && "opacity-60")}>
                      <td className="td"><p className="font-semibold text-navy-900">{u.full_name}</p><p className="text-xs text-muted">{u.email}</p></td>
                      <td className="td"><Badge tone={u.role === "admin" ? "bad" : u.role === "hod" ? "warn" : "info"}>{ROLE_LABEL[u.role as Role]}</Badge></td>
                      <td className="td text-sm">{st ? `${st.univ_roll_no} · Sem ${st.semester}` : t?.departments?.name ?? "-"}</td>
                      <td className="td">{u.is_active ? <Badge tone="ok">Active</Badge> : <Badge tone="bad">Disabled</Badge>}</td>
                      <td className="td text-xs text-muted">{fmtDate(u.created_at)}</td>
                      <td className="td"><Link href={`/admin/users/${u.id}`} className="btn btn-ghost btn-sm">Manage</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
            <Pagination page={page} total={count ?? 0} basePath="/admin/users" params={{ role: roleF, q }} />
          </>
        ) : (
          <EmptyState title="No users found" />
        )}
      </Card>
    </>
  );
}
