import "server-only";
import { after } from "next/server";
import { admin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { chunk } from "@/lib/utils";

export type NotifyItem = {
  userId: string;
  title: string;
  message: string;
  link?: string;
  /** If the same key appears again, no duplicate notification is created (e.g. "low_att:<subject>:2026-W45") */
  dedupeKey?: string;
  email?: boolean;
};

/** In-app notification + (optional) email. If it fails, the main operation does not stop. */
export async function notify(items: NotifyItem[]): Promise<void> {
  if (items.length === 0) return;
  try {
    const db = admin();
    let todo = items;

    const keyed = items.filter((i) => i.dedupeKey);
    if (keyed.length) {
      const { data: existing } = await db
        .from("notifications")
        .select("user_id,dedupe_key")
        .in("dedupe_key", [...new Set(keyed.map((k) => k.dedupeKey!))])
        .in("user_id", [...new Set(keyed.map((k) => k.userId))]);
      const seen = new Set((existing ?? []).map((e) => `${e.user_id}|${e.dedupe_key}`));
      todo = items.filter((i) => !i.dedupeKey || !seen.has(`${i.userId}|${i.dedupeKey}`));
    }
    if (todo.length === 0) return;

    for (const part of chunk(todo, 500)) {
      const rows = part.map((i) => ({
        user_id: i.userId,
        title: i.title,
        message: i.message,
        link: i.link ?? null,
        dedupe_key: i.dedupeKey ?? null,
      }));
      const { error } = await db.from("notifications").insert(rows);
      if (error) {
        // unique violation under a race condition: insert one by one
        for (const r of rows) await db.from("notifications").insert(r);
      }
    }

    const emailItems = todo.filter((i) => i.email).slice(0, 200);
    if (emailItems.length && process.env.RESEND_API_KEY) {
      after(async () => {
        const { data: users } = await db
          .from("users")
          .select("id,email")
          .in("id", [...new Set(emailItems.map((i) => i.userId))]);
        const emailOf = new Map((users ?? []).map((u) => [u.id, u.email]));
        for (const part of chunk(emailItems, 10)) {
          await Promise.allSettled(
            part.map((i) => {
              const to = emailOf.get(i.userId);
              return to ? sendEmail(to, i.title, i.message, i.link) : Promise.resolve();
            }),
          );
        }
      });
    }
  } catch (e) {
    console.error("[notify] failed", e);
  }
}
