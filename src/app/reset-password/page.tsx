import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { resetPassword } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, Field, SubmitButton } from "@/components/ui/form";
import { AuthFrame } from "@/components/shell/auth-frame";

export const metadata: Metadata = { title: "Set new password" };

export default async function ResetPasswordPage() {
  const jar = await cookies();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Only allow sessions that came from an email reset link
  if (!user || jar.get("pw_recovery")?.value !== "1") redirect("/forgot-password?error=link");

  return (
    <AuthFrame title="Set a new password" subtitle="At least 10 characters: an uppercase letter, a lowercase letter and a number.">
      <ActionForm action={resetPassword}>
        <Field name="password" label="New password" as="password" autoComplete="new-password" required />
        <Field name="confirm" label="Confirm password" as="password" autoComplete="new-password" required />
        <SubmitButton className="w-full !py-3">
          <ShieldCheck className="size-4" /> Save password
        </SubmitButton>
      </ActionForm>
    </AuthFrame>
  );
}
