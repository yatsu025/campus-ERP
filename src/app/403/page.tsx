import type { Metadata } from "next";
import Link from "next/link";
import { ErrorScreen } from "@/components/shell/error-screen";

export const metadata: Metadata = { title: "Access denied" };

export default function Forbidden() {
  return (
    <ErrorScreen code="403" title="You don't have permission to view this page" text="This page isn't available for your role. If you believe this is a mistake, contact your college Admin.">
      <Link href="/dashboard" className="btn btn-primary">
        Go to your dashboard
      </Link>
    </ErrorScreen>
  );
}
