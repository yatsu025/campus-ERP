"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { fail, parseForm, succeed, type ActionState } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { NOC_DOC_TYPES } from "@/lib/constants";
import { parseDate } from "@/lib/dates";
import { notify } from "@/lib/notify";

const isoDate = z.string().trim().refine((v) => parseDate(v) === v, "Choose a valid date.");

const settingsSchema = z
  .object({
    open_date: isoDate,
    close_date: isoDate,
    docs: z
      .union([z.string(), z.array(z.string())], "Select at least one document.")
      .transform((v) => (Array.isArray(v) ? v : [v])),
  })
  .refine((v) => v.open_date <= v.close_date, { message: "Open date must be before close date.", path: ["close_date"] })
  .refine((v) => v.docs.length >= 1 && v.docs.every((d) => d in NOC_DOC_TYPES), { message: "Invalid document list.", path: ["docs"] });

export async function saveNocSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("hod");
  const parsed = parseForm(settingsSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { open_date, close_date, docs } = parsed.data;

  const { error } = await admin()
    .from("noc_settings")
    .upsert({ department_id: user.departmentId!, open_date, close_date, required_docs: [...new Set(docs)], updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "department_id" });
  if (error) return fail("Could not save the settings.");
  await audit({ userId: user.id, departmentId: user.departmentId, action: "noc.settings", entity: "department", entityId: user.departmentId!, details: { open_date, close_date, docs } });
  revalidatePath("/hod/noc/settings");
  return succeed("NOC settings saved.");
}

const decideSchema = z.object({
  request_id: z.uuid(),
  decision: z.enum(["under_review", "approved", "rejected"]),
  remark: z.string().trim().max(500, "Remark must be at most 500 characters.").optional(),
});

export async function decideNoc(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("hod");
  const parsed = parseForm(decideSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { request_id, decision, remark } = parsed.data;
  if (decision === "rejected" && (remark ?? "").length < 10) return fail("A reason (remark) of at least 10 characters is required when rejecting.", { remark: ["Enter a remark."] });

  const db = admin();
  const { data: req } = await db.from("noc_requests").select("id,status,department_id,student_id,company_name,students(user_id,name)").eq("id", request_id).maybeSingle();
  if (!req || req.department_id !== user.departmentId) return fail("This request does not belong to your department.");
  if (!["applied", "under_review"].includes(req.status)) return fail("A decision has already been made on this request.");
  if (decision === "under_review" && req.status === "under_review") return fail("This is already Under Review.");

  const patch =
    decision === "under_review"
      ? { status: "under_review" as const }
      : { status: decision, remark: remark || null, decided_by: user.id, decided_at: new Date().toISOString() };
  const { error } = await db.from("noc_requests").update(patch).eq("id", request_id).in("status", ["applied", "under_review"]);
  if (error) return fail("Could not update.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stu: any = req.students;
  const text = { under_review: "is Under Review", approved: "has been approved", rejected: "has been rejected" }[decision];
  if (stu?.user_id) {
    await notify([
      {
        userId: stu.user_id,
        title: `NOC ${decision === "under_review" ? "review started" : decision === "approved" ? "approved" : "rejected"}`,
        message: `Your NOC request for ${req.company_name} ${text}.${remark ? ` HOD remark: ${remark}` : ""}`,
        link: "/student/noc/status",
        email: true,
      },
    ]);
  }
  await audit({ userId: user.id, departmentId: user.departmentId, action: `noc.${decision}`, entity: "noc_request", entityId: request_id, details: { remark: remark ?? null } });
  revalidatePath("/hod/noc/requests");
  revalidatePath(`/hod/noc/requests/${request_id}`);
  return succeed(`Request ${text}.`);
}
