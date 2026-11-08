import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogIn } from "lucide-react";
import { login } from "@/app/actions/auth";
import { getSessionUser } from "@/lib/auth";
import { safeNext } from "@/lib/action";
import { strParam } from "@/lib/utils";
import { ActionForm, Field, SubmitButton } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { AuthFrame } from "@/components/shell/auth-frame";

export const metadata: Metadata = { title: "Login" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const error = strParam(sp.error);
  const next = safeNext(strParam(sp.next, 300), "");

  if (!error) {
    // Already signed in: go straight to the dashboard
    try {
      if (await getSessionUser()) redirect("/dashboard");
    } catch (e) {
      if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    }
  }

  return (
    <AuthFrame
      title="Sign in"
      subtitle="Student: University Roll No. · Teacher / HOD / Admin: Email"
      footer={
        <Link href="/forgot-password" className="font-semibold text-crimson hover:underline">
          Forgot password?
        </Link>
      }
    >
      {error === "session" && (
        <div className="mb-4">
          <Alert tone="warn">Your session expired or the account is not active. Please sign in again.</Alert>
        </div>
      )}
      <ActionForm action={login}>
        <input type="hidden" name="next" value={next} />
        <Field name="identifier" label="Roll No. / Email" placeholder="e.g. 97240065 or name@united.ac.in" autoComplete="username" required />
        <Field name="password" label="Password" as="password" required />
        <SubmitButton className="w-full !py-3" pendingText="Signing in…">
          <LogIn className="size-4" /> Sign In
        </SubmitButton>
      </ActionForm>
      <p className="mt-4 rounded-lg bg-paper-2 px-3 py-2 text-xs leading-relaxed text-muted">
        New accounts are created only by the college Admin. On first sign-in you will need to change your password.
      </p>
    </AuthFrame>
  );
}
