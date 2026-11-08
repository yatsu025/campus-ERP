"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fail, parseForm, succeed, type ActionState } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { MAX_NOC_FILE_BYTES, NOC_DOC_TYPES, type NocDocType } from "@/lib/constants";
import { portalState, type NocSettings } from "@/lib/data";
import { parseDate } from "@/lib/dates";
import { EXT_FOR, analyzeFile, analyzeRequestFields, riskFromFlags, sha256, sniffMime, type Flag } from "@/lib/noc-checks";
import { notify } from "@/lib/notify";
import { isUuid } from "@/lib/utils";

const BUCKET = "noc-documents";
const ACTIVE = ["draft", "applied", "under_review", "approved"] as const;

const isoDate = z
  .string()
  .trim()
  .refine((v) => parseDate(v) === v, "Enter a valid date (YYYY-MM-DD).");

const websiteField = z.preprocess(
  (v) => {
    const t = typeof v === "string" ? v.trim() : "";
    if (!t) return undefined;
    return /^https?:\/\//i.test(t) ? t : `https://${t}`;
  },
  z
    .string()
    .max(200)
    .refine((v) => {
      try {
        const u = new URL(v);
        return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".");
      } catch {
        return false;
      }
    }, "The company website URL is not valid.")
    .optional(),
);

const detailsSchema = z
  .object({
    company_name: z.string().trim().min(2, "Enter the company name.").max(150),
    company_email: z.email("Enter a valid company email.").max(150),
    company_website: websiteField,
    position: z.string().trim().min(2, "Enter the role / position.").max(120),
    start_date: isoDate,
    end_date: isoDate,
    purpose: z.string().trim().min(10, "Write the purpose in at least 10 characters.").max(600),
  })
  .refine((v) => v.end_date >= v.start_date, { message: "The end date cannot be before the start date.", path: ["end_date"] });

async function getContext() {
  const user = await requireRole("student");
  const supabase = await createClient();
  const [{ data: settings }, { data: active }] = await Promise.all([
    supabase.from("noc_settings").select("open_date,close_date,required_docs").eq("department_id", user.departmentId!).maybeSingle(),
    supabase.from("noc_requests").select("id,status").eq("student_id", user.student!.id).in("status", [...ACTIVE]).maybeSingle(),
  ]);
  return { user, settings: settings as NocSettings, active };
}

/* ---------------------------- STEP 1: DETAILS ---------------------------- */
export async function saveNocDraft(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, settings, active } = await getContext();
  const parsed = parseForm(detailsSchema, formData);
  if (!parsed.ok) return parsed.state;

  const portal = portalState(settings);
  if (!portal.open) return fail(portal.reason);
  if (active && active.status !== "draft") return fail("You already have an NOC request in process. A new request can only be created if it is rejected.");

  const d = parsed.data;
  const row = {
    company_name: d.company_name,
    company_email: d.company_email.toLowerCase(),
    company_website: d.company_website ?? null,
    position: d.position,
    start_date: d.start_date,
    end_date: d.end_date,
    purpose: d.purpose,
  };

  const db = admin();
  if (active) {
    const { error } = await db.from("noc_requests").update(row).eq("id", active.id).eq("student_id", user.student!.id).eq("status", "draft");
    if (error) return fail("Could not save the details. Please try again.");
  } else {
    const { error } = await db.from("noc_requests").insert({ ...row, student_id: user.student!.id, department_id: user.departmentId!, status: "draft" });
    if (error) return fail("Could not save the details. Please try again.");
  }
  revalidatePath("/student/noc/apply");
  return succeed("Details saved. Now upload the required documents below.");
}

/* --------------------------- STEP 2: DOCUMENTS --------------------------- */
const uploadSchema = z.object({
  request_id: z.uuid(),
  doc_type: z.enum(Object.keys(NOC_DOC_TYPES) as [NocDocType, ...NocDocType[]], "Invalid document type."),
});

export async function uploadNocDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, settings, active } = await getContext();
  const parsed = parseForm(uploadSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { request_id, doc_type } = parsed.data;

  if (!active || active.id !== request_id || active.status !== "draft") return fail("This request can no longer be edited.");
  if (!portalState(settings).open) return fail(portalState(settings).reason);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Select a file first.", { file: ["Select a file."] });
  if (file.size > MAX_NOC_FILE_BYTES) return fail(`File is larger than ${MAX_NOC_FILE_BYTES / 1024 / 1024}MB.`, { file: ["The file is too large."] });

  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(buf); // detect the real type from the bytes, not the extension
  if (!mime) return fail("Only PDF, JPG or PNG files are allowed.", { file: ["This file type is not allowed."] });

  const { flags, meta } = await analyzeFile(buf, mime);
  const db = admin();

  // Remove any existing document of the same type
  const { data: old } = await db.from("noc_documents").select("id,file_path").eq("request_id", request_id).eq("doc_type", doc_type).maybeSingle();
  if (old) {
    await db.storage.from(BUCKET).remove([old.file_path]);
    await db.from("noc_documents").delete().eq("id", old.id);
  }

  const path = `${user.student!.id}/${request_id}/${doc_type}-${randomUUID()}.${EXT_FOR[mime]}`;
  const { error: upErr } = await db.storage.from(BUCKET).upload(path, buf, { contentType: mime, upsert: false });
  if (upErr) return fail("Could not upload the file. Please try again.");

  const safeName = file.name.replace(/[^\w. -]/g, "_").slice(0, 120) || `document.${EXT_FOR[mime]}`;
  const { error } = await db.from("noc_documents").insert({
    request_id,
    doc_type,
    file_path: path,
    original_name: safeName,
    mime_type: mime,
    size_bytes: buf.length,
    sha256: sha256(buf),
    check_result: { flags, meta },
  });
  if (error) {
    await db.storage.from(BUCKET).remove([path]);
    return fail("Could not save the document. Please try again.");
  }
  revalidatePath("/student/noc/apply");
  return succeed(`${NOC_DOC_TYPES[doc_type]} uploaded successfully.`);
}

/* ---------------------------- STEP 3: SUBMIT ----------------------------- */
const idSchema = z.object({ request_id: z.uuid() });

export async function submitNoc(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, settings, active } = await getContext();
  const parsed = parseForm(idSchema, formData);
  if (!parsed.ok) return parsed.state;
  if (!active || active.id !== parsed.data.request_id || active.status !== "draft") return fail("This request cannot be submitted.");
  const portal = portalState(settings);
  if (!portal.open) return fail(portal.reason);

  const db = admin();
  const { data: req } = await db.from("noc_requests").select("*").eq("id", active.id).single();
  const { data: docs } = await db.from("noc_documents").select("id,doc_type,sha256,check_result").eq("request_id", active.id);
  if (!req) return fail("Request not found.");

  const required = (settings?.required_docs ?? []) as string[];
  const have = new Set((docs ?? []).map((d) => d.doc_type));
  const missing = required.filter((r) => !have.has(r));
  if (missing.length) return fail(`The following documents are still pending: ${missing.map((m) => NOC_DOC_TYPES[m as NocDocType] ?? m).join(", ")}`);

  // ---- V1 document checks (red flags for the HOD) ----
  const flags: (Flag & { source: string; doc_type?: string })[] = analyzeRequestFields({
    companyEmail: req.company_email,
    companyWebsite: req.company_website,
    startDate: req.start_date,
    endDate: req.end_date,
  }).map((f) => ({ ...f, source: "form" }));

  for (const d of docs ?? []) {
    const cr = d.check_result as { flags?: Flag[] } | null;
    for (const f of cr?.flags ?? []) flags.push({ ...f, source: "document", doc_type: d.doc_type });

    // Duplicate document: the same file used in another student's request
    const { data: dupes } = await db
      .from("noc_documents")
      .select("id,request_id,noc_requests!inner(student_id)")
      .eq("sha256", d.sha256)
      .neq("request_id", active.id)
      .limit(1);
    if (dupes && dupes.length) {
      flags.push({
        code: "duplicate_document",
        severity: "high",
        message: `${NOC_DOC_TYPES[d.doc_type as NocDocType] ?? d.doc_type}: this exact file has already been uploaded in another NOC request.`,
        source: "document",
        doc_type: d.doc_type,
      });
    }
  }
  // The same file used for two different document types
  const seen = new Map<string, string>();
  for (const d of docs ?? []) {
    if (seen.has(d.sha256)) {
      flags.push({ code: "same_file_twice", severity: "medium", message: "The same file has been uploaded for two different document types.", source: "document", doc_type: d.doc_type });
    }
    seen.set(d.sha256, d.doc_type);
  }

  const risk = riskFromFlags(flags);
  const { error } = await db
    .from("noc_requests")
    .update({ status: "applied", risk_level: risk, red_flags: flags, submitted_at: new Date().toISOString() })
    .eq("id", active.id)
    .eq("status", "draft");
  if (error) return fail("Could not submit the request. Please try again.");

  // Notify the HOD
  const { data: hods } = await db.from("teachers").select("user_id,users!inner(role,is_active)").eq("department_id", user.departmentId!).eq("users.role", "hod").eq("users.is_active", true);
  await notify(
    (hods ?? []).map((h) => ({
      userId: h.user_id,
      title: "New NOC request",
      message: `${user.fullName} (${user.student!.rollNo}) has applied for NOC for ${req.company_name}.`,
      link: `/hod/noc/requests/${active.id}`,
      email: true,
    })),
  );
  await audit({ userId: user.id, departmentId: user.departmentId, action: "noc.apply", entity: "noc_request", entityId: active.id, details: { company: req.company_name, risk } });
  revalidatePath("/student/noc/apply");
  revalidatePath("/student/noc/status");
  return succeed("NOC request submitted. Open the 'NOC Status' page to track it.");
}

/* ---------------------------- DISCARD DRAFT ------------------------------ */
export async function discardNocDraft(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, active } = await getContext();
  const parsed = parseForm(idSchema, formData);
  if (!parsed.ok) return parsed.state;
  if (!active || active.id !== parsed.data.request_id || active.status !== "draft" || !isUuid(active.id)) return fail("Only drafts can be discarded.");

  const db = admin();
  const { data: docs } = await db.from("noc_documents").select("file_path").eq("request_id", active.id);
  if (docs?.length) await db.storage.from(BUCKET).remove(docs.map((d) => d.file_path));
  await db.from("noc_requests").delete().eq("id", active.id).eq("student_id", user.student!.id).eq("status", "draft");
  await audit({ userId: user.id, departmentId: user.departmentId, action: "noc.discard_draft", entity: "noc_request", entityId: active.id });
  revalidatePath("/student/noc/apply");
  return succeed("Draft discarded.");
}
