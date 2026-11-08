"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fail, parseForm, safeNext, succeed, type ActionState } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { attemptsInWindow, clearAttempts, recordAttempt } from "@/lib/throttle";

const GENERIC_LOGIN_ERROR = "Incorrect roll number / email or password.";

/** Strong password policy: enforced on the server */
const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters long.")
  .max(72, "Password must be at most 72 characters long.")
  .regex(/[a-z]/, "Password must contain a lowercase letter (a-z).")
  .regex(/[A-Z]/, "Password must contain an uppercase letter (A-Z).")
  .regex(/[0-9]/, "Password must contain a number.");

/* ------------------------------ LOGIN ------------------------------ */
const loginSchema = z.object({
  identifier: z.string().trim().min(3, "Enter your roll number or email.").max(120),
  password: z.string().min(1, "Enter your password.").max(200),
  next: z.string().max(300).optional(),
});

export async function login(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(loginSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { identifier, password, next } = parsed.data;

  const key = identifier.toLowerCase();
  // Block after 8 failed attempts within 15 minutes (brute-force protection)
  if ((await attemptsInWindow(key, 15)) >= 8) {
    return fail("Too many failed attempts. Please try again after 15 minutes.");
  }

  let email: string | null = null;
  if (identifier.includes("@")) {
    const ok = z.email().safeParse(identifier);
    email = ok.success ? identifier.toLowerCase() : null;
  } else if (/^[A-Za-z0-9]{4,20}$/.test(identifier)) {
    // Look up the email by University Roll No (service role: there is no RLS user before login)
    const { data } = await admin().from("students").select("users(email)").eq("univ_roll_no", identifier.toUpperCase()).maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    email = ((data as any)?.users?.email as string | undefined) ?? null;
  }

  if (!email) {
    await recordAttempt(key);
    return fail(GENERIC_LOGIN_ERROR);
  }

  const supabase = await createClient();
  const { data: signIn, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !signIn.user) {
    await recordAttempt(key);
    return fail(GENERIC_LOGIN_ERROR);
  }

  const { data: row } = await supabase.from("users").select("role,is_active").eq("id", signIn.user.id).maybeSingle();
  if (!row || !row.is_active) {
    await supabase.auth.signOut();
    return fail("This account is not active. Contact an admin.");
  }

  await clearAttempts(key);
  await audit({ userId: signIn.user.id, action: "auth.login", entity: "user", entityId: signIn.user.id });
  redirect(safeNext(next, "/dashboard"));
}

/* ------------------------------ LOGOUT ----------------------------- */
export async function logout() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await audit({ userId: user.id, action: "auth.logout", entity: "user", entityId: user.id });
  await supabase.auth.signOut();
  redirect("/login");
}

/* -------------------------- FORGOT PASSWORD ------------------------ */
const forgotSchema = z.object({ email: z.email("Enter a valid email.").max(120) });

export async function forgotPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(forgotSchema, formData);
  if (!parsed.ok) return parsed.state;
  const email = parsed.data.email.toLowerCase();

  const key = `reset:${email}`;
  if ((await attemptsInWindow(key, 60)) >= 4) {
    return fail("A reset link has been sent to this email several times already. Please try again later.");
  }
  await recordAttempt(key);

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${env.siteUrl}/auth/callback?next=/reset-password`,
  });
  // Never reveal whether the email exists (prevents account enumeration)
  return succeed("If this email is registered, a password reset link has been sent. Please check both your inbox and spam folder.");
}

/* --------------------------- RESET PASSWORD ------------------------ */
const resetSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Both passwords must match.", path: ["confirm"] });

export async function resetPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const jar = await cookies();
  if (jar.get("pw_recovery")?.value !== "1") return fail("The reset link has expired. Please request a new link via 'Forgot password'.");

  const parsed = parseForm(resetSchema, formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Session not found. Please open the reset link again.");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail("Could not update the password. Use a password different from the old one and try again.");

  await admin().from("users").update({ must_change_password: false }).eq("id", user.id);
  await audit({ userId: user.id, action: "auth.password_reset", entity: "user", entityId: user.id });
  jar.delete("pw_recovery");
  await supabase.auth.signOut({ scope: "others" });
  redirect("/dashboard");
}

/* --------------------------- CHANGE PASSWORD ----------------------- */
const changeSchema = z
  .object({ current: z.string().min(1, "Enter your current password.").max(200), password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Both passwords must match.", path: ["confirm"] })
  .refine((v) => v.password !== v.current, { message: "The new password must be different from the current one.", path: ["password"] });

export async function changePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parseForm(changeSchema, formData);
  if (!parsed.ok) return parsed.state;

  const key = `chpw:${user.id}`;
  if ((await attemptsInWindow(key, 15)) >= 5) return fail("Too many attempts. Please try again after 15 minutes.");

  const supabase = await createClient();
  // Verify the current password first
  const { error: verifyErr } = await supabase.auth.signInWithPassword({ email: user.email, password: parsed.data.current });
  if (verifyErr) {
    await recordAttempt(key);
    return fail("The current password is incorrect.", { current: ["The current password is incorrect."] });
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail("Could not update the password. Please try again.");

  await admin().from("users").update({ must_change_password: false }).eq("id", user.id);
  await audit({ userId: user.id, action: "auth.password_change", entity: "user", entityId: user.id });
  await clearAttempts(key);
  await supabase.auth.signOut({ scope: "others" });
  if (user.mustChangePassword) redirect("/dashboard");
  return succeed("Password changed. You have been logged out of all other devices.");
}
