import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { MarksUploadPanel } from "@/components/marks-upload-panel";
import { PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Upload marks" };

export default async function TeacherMarksUpload({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole("teacher");
  return (
    <>
      <PageHeader kicker="Sessional marks" title="Upload marks" description="Choose the subject and exam, fill in the template, review the preview, and confirm. Marks are shown to students only when the HOD publishes them." />
      <MarksUploadPanel user={user} searchParams={await searchParams} />
    </>
  );
}
