import { requireRoleForPage } from "@/lib/auth";
import { AppShell } from "@/components/shell/app-shell";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRoleForPage("teacher");
  return <AppShell user={user}>{children}</AppShell>;
}
