import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { MarksUploadPanel } from "@/components/marks-upload-panel";
import { PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Upload marks" };

export default async function HodMarksUpload({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole("hod");
  return (
    <>
      <PageHeader kicker="Sessional marks" title="Upload marks" description="You can upload marks for any subject in your department. After uploading, publish them from Marks Management." />
      <MarksUploadPanel user={user} searchParams={await searchParams} />
    </>
  );
}
