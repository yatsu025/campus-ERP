"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { fail, parseForm, type ActionState } from "@/lib/action";
import { requireRole } from "@/lib/auth";

const schema = z.object({ upload_id: z.uuid(), back: z.string().regex(/^\/[a-z0-9/_-]*$/) });

/** "Discard" after preview: nothing is saved */
export async function discardUpload(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("teacher", "hod", "admin");
  const parsed = parseForm(schema, formData);
  if (!parsed.ok) return parsed.state;
  const { error } = await admin()
    .from("upload_logs")
    .update({ status: "discarded", payload: null })
    .eq("id", parsed.data.upload_id)
    .eq("uploaded_by", user.id)
    .eq("status", "previewed");
  if (error) return fail("Could not discard.");
  redirect(parsed.data.back);
}
