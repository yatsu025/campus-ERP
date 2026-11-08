import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { changePassword } from "@/app/actions/auth";
import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/shell/app-shell";
import { ActionForm, Field, SubmitButton } from "@/components/ui/form";
import { Alert, Card, PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  const user = await requireUser();
  return (
    <AppShell user={user}>
      <PageHeader kicker="Account" title="Change password" description="The new password must be at least 10 characters: an uppercase letter, a lowercase letter and a number." />
      {user.mustChangePassword && (
        <div className="mb-5 max-w-xl">
          <Alert tone="warn" title="First sign-in">
            Your account was created with a temporary password. You must change your password before continuing.
          </Alert>
        </div>
      )}
      <Card className="max-w-xl p-6">
        <ActionForm action={changePassword} resetOnSuccess>
          <Field name="current" label="Current password" as="password" required />
          <Field name="password" label="New password" as="password" autoComplete="new-password" required />
          <Field name="confirm" label="Confirm new password" as="password" autoComplete="new-password" required />
          <SubmitButton>
            <ShieldCheck className="size-4" /> Update password
          </SubmitButton>
        </ActionForm>
      </Card>
    </AppShell>
  );
}
