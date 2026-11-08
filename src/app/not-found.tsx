import Link from "next/link";
import { ErrorScreen } from "@/components/shell/error-screen";

export default function NotFound() {
  return (
    <ErrorScreen code="404" title="Page not found" text="The link is broken or the page has been removed.">
      <Link href="/dashboard" className="btn btn-primary">
        Go to dashboard
      </Link>
    </ErrorScreen>
  );
}
