import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { SectionsManager } from "@/components/sections-manager";
import { PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Sections" };

export default async function HodSections() {
  const user = await requireRole("hod");
  return (
    <>
      <PageHeader kicker="Section management" title="Sections" description="Create sections for each semester and assign students by roll number. Changing a section does not affect past attendance or marks." />
      <SectionsManager user={user} />
    </>
  );
}
