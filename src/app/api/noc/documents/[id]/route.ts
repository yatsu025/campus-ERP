import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { isUuid } from "@/lib/utils";

/**
 * Route to view a NOC document. RLS first checks whether this user may view the document
 * (the student themselves or the HOD of that department), then a 60-second signed URL is issued.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!isUuid(id)) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: doc } = await supabase.from("noc_documents").select("id,file_path,request_id,doc_type").eq("id", id).maybeSingle();
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const { data: signed } = await admin().storage.from("noc-documents").createSignedUrl(doc.file_path, 60);
  if (!signed?.signedUrl) return new NextResponse("File not found", { status: 404 });

  if (user.role === "hod") {
    await audit({ userId: user.id, departmentId: user.departmentId, action: "noc.view_document", entity: "noc_document", entityId: doc.id, details: { request: doc.request_id, type: doc.doc_type } });
  }
  const res = NextResponse.redirect(signed.signedUrl);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
