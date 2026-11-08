import { requireRoleForPage } from "@/lib/auth";
import { AppShell } from "@/components/shell/app-shell";

export default async function HodLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRoleForPage("hod");
  return <AppShell user={user}>{children}</AppShell>;
}
