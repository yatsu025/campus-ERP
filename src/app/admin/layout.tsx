import { requireRoleForPage } from "@/lib/auth";
import { AppShell } from "@/components/shell/app-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRoleForPage("admin");
  return <AppShell user={user}>{children}</AppShell>;
}
