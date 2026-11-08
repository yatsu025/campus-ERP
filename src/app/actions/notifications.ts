"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseForm, type ActionState } from "@/lib/action";
import { requireUser } from "@/lib/auth";

/** Mark your own notifications as read. Uses the user's RLS client (the policy allows only their own rows). */
export async function markAllRead(): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
  revalidatePath("/notifications");
}

export async function markRead(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parseForm(z.object({ id: z.uuid() }), fd);
  if (!parsed.ok) return parsed.state;
  const supabase = await createClient();
  await supabase.from("notifications").update({ is_read: true }).eq("id", parsed.data.id).eq("user_id", user.id);
  revalidatePath("/notifications");
  return null;
}
