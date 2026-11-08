import { z } from "zod";

/** Standard response for every Server Action. The UI only displays it; the server makes the decision. */
export type ActionState<T = unknown> = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  data?: T;
} | null;

export const fail = (message: string, fieldErrors?: Record<string, string[] | undefined>): ActionState<never> => ({
  ok: false,
  message,
  fieldErrors,
});

export const succeed = <T = undefined>(message: string, data?: T): ActionState<T> => ({ ok: true, message, data });

/**
 * Validates FormData against a zod schema on the server.
 * File fields are ignored here (they are checked separately).
 */
export function parseForm<S extends z.ZodType>(
  schema: S,
  formData: FormData,
): { ok: true; data: z.infer<S> } | { ok: false; state: ActionState<never> } {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    if (key.startsWith("$ACTION")) continue;
    raw[key] = raw[key] === undefined ? value : Array.isArray(raw[key]) ? [...(raw[key] as string[]), value] : [raw[key], value];
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const fieldErrors = z.flattenError(result.error).fieldErrors as Record<string, string[] | undefined>;
    const first = Object.values(fieldErrors).flat()[0];
    return { ok: false, state: fail(first ?? "Something is wrong in the form, please check again.", fieldErrors) };
  }
  return { ok: true, data: result.data };
}

/** Safe redirect target: only a relative path within this site */
export function safeNext(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}
