import type { Metadata } from "next";
import Link from "next/link";
import { Send } from "lucide-react";
import { forgotPassword } from "@/app/actions/auth";
import { strParam } from "@/lib/utils";
import { ActionForm, Field, SubmitButton } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { AuthFrame } from "@/components/shell/auth-frame";

export const metadata: Metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return (
    <AuthFrame
      title="Password reset"
      subtitle="Enter your registered email and we'll send a reset link."
      footer={
        <Link href="/login" className="font-semibold text-crimson hover:underline">
          Back to login
        </Link>
      }
    >
      {strParam(sp.error) === "link" && (
        <div className="mb-4">
          <Alert tone="bad">The reset link is invalid or has expired. Request a new link.</Alert>
        </div>
      )}
      <ActionForm action={forgotPassword}>
        <Field name="email" type="email" label="Registered email" placeholder="name@example.com" autoComplete="email" required />
        <SubmitButton className="w-full !py-3" pendingText="Sending…">
          <Send className="size-4" /> Send reset link
        </SubmitButton>
      </ActionForm>
    </AuthFrame>
  );
}
