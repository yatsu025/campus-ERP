import "server-only";
import { headers } from "next/headers";
import { admin } from "@/lib/supabase/admin";

type AuditInput = {
  userId?: string | null;
  departmentId?: string | null;
  action: string; // e.g. "attendance.upload", "marks.publish", "noc.approve"
  entity?: string;
  entityId?: string;
  details?: Record<string, unknown>;
};

/** Writing the audit log never fails the main operation. */
export async function audit(input: AuditInput): Promise<void> {
  try {
    let ip: string | undefined;
    try {
      const h = await headers();
      ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
    } catch {
      /* headers() is not available outside a request */
    }
    await admin()
      .from("audit_logs")
      .insert({
        user_id: input.userId ?? null,
        department_id: input.departmentId ?? null,
        action: input.action,
        entity: input.entity ?? null,
        entity_id: input.entityId ?? null,
        details: { ...(input.details ?? {}), ...(ip ? { ip } : {}) },
      });
  } catch (e) {
    console.error("[audit] failed", e);
  }
}
