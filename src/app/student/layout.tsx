import { requireRoleForPage } from "@/lib/auth";
import { AppShell } from "@/components/shell/app-shell";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRoleForPage("student");
  return <AppShell user={user}>{children}</AppShell>;
}
