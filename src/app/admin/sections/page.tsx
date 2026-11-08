import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { SectionsManager } from "@/components/sections-manager";
import { PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Sections" };

export default async function AdminSections() {
  const user = await requireRole("admin");
  return (
    <>
      <PageHeader kicker="Section management" title="Sections (all departments)" description="An admin can create and assign sections for any department." />
      <SectionsManager user={user} />
    </>
  );
}
