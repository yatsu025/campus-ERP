import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { admin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { LOGO_PNG_BASE64 } from "@/lib/brand-assets";
import { SITE } from "@/lib/constants";
import { fmtDate, isUuid } from "@/lib/utils";

const clean = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, "?"); // standard PDF fonts: Latin only

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const w of clean(text).split(/\s+/)) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > width && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireRole("student");
  const { id } = await ctx.params;
  if (!isUuid(id)) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: r } = await supabase
    .from("noc_requests")
    .select("id,company_name,position,start_date,end_date,decided_at,decided_by,department_id")
    .eq("id", id)
    .eq("student_id", user.student!.id)
    .eq("status", "approved")
    .maybeSingle();
  if (!r) return new NextResponse("Not found", { status: 404 });

  const { data: hod } = r.decided_by ? await admin().from("users").select("full_name").eq("id", r.decided_by).maybeSingle() : { data: null };

  const pdf = await PDFDocument.create();
  pdf.setTitle("No Objection Certificate");
  pdf.setProducer("Campus ERP | yatsu");
  const page = pdf.addPage([595, 842]);
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifB = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const sans = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.043, 0.122, 0.29);
  const crimson = rgb(0.608, 0.114, 0.133);
  const ink = rgb(0.1, 0.1, 0.12);

  page.drawRectangle({ x: 28, y: 28, width: 539, height: 786, borderColor: navy, borderWidth: 1.5 });
  page.drawRectangle({ x: 34, y: 34, width: 527, height: 774, borderColor: crimson, borderWidth: 0.6 });

  const logo = await pdf.embedPng(Buffer.from(LOGO_PNG_BASE64, "base64"));
  const lw = 210;
  const lh = (logo.height / logo.width) * lw;
  page.drawImage(logo, { x: (595 - lw) / 2, y: 842 - 56 - lh, width: lw, height: lh });

  let y = 842 - 56 - lh - 30;
  const center = (t: string, f: PDFFont, s: number, color = ink) => {
    page.drawText(clean(t), { x: (595 - f.widthOfTextAtSize(clean(t), s)) / 2, y, size: s, font: f, color });
  };
  center("NO OBJECTION CERTIFICATE", sans, 17, navy);
  y -= 8;
  page.drawLine({ start: { x: 247, y }, end: { x: 348, y }, thickness: 2, color: crimson });
  y -= 28;

  const ref = `NOC/${new Date(r.decided_at ?? Date.now()).getFullYear()}/${r.id.slice(0, 8).toUpperCase()}`;
  page.drawText(`Ref. No.: ${ref}`, { x: 64, y, size: 10.5, font: serif, color: ink });
  const dateText = `Date: ${fmtDate(r.decided_at)}`;
  page.drawText(dateText, { x: 531 - serif.widthOfTextAtSize(dateText, 10.5), y, size: 10.5, font: serif, color: ink });
  y -= 36;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: st } = await supabase.from("students").select("name,univ_roll_no,semester,courses(name,departments(name,institutes(name)))").eq("id", user.student!.id).single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = st?.courses;
  const institute = c?.departments?.institutes?.name ?? SITE.group;

  const body =
    `This is to certify that ${st?.name} (University Roll No. ${st?.univ_roll_no}), a bonafide student of ${c?.name}, Semester ${st?.semester}, ` +
    `Department of ${c?.departments?.name}, ${institute}, ${SITE.group}, has been granted permission to undertake ` +
    `${r.position} with ${r.company_name} from ${fmtDate(r.start_date)} to ${fmtDate(r.end_date)}.`;
  for (const line of wrap(body, serif, 12.5, 467)) {
    page.drawText(line, { x: 64, y, size: 12.5, font: serif, color: ink });
    y -= 21;
  }
  y -= 10;
  const body2 = "The institute has no objection to the student pursuing the above engagement for the stated period. This certificate is issued on the request of the student.";
  for (const line of wrap(body2, serif, 12.5, 467)) {
    page.drawText(line, { x: 64, y, size: 12.5, font: serif, color: ink });
    y -= 21;
  }

  y -= 24;
  const rows: [string, string][] = [
    ["Student", `${st?.name}`],
    ["University Roll No.", `${st?.univ_roll_no}`],
    ["Course / Semester", `${c?.name} / Sem ${st?.semester}`],
    ["Organisation", r.company_name],
    ["Role", r.position],
    ["Period", `${fmtDate(r.start_date)} to ${fmtDate(r.end_date)}`],
  ];
  for (const [k, v] of rows) {
    page.drawText(clean(k), { x: 64, y, size: 10.5, font: sans, color: navy });
    page.drawText(clean(v), { x: 200, y, size: 11.5, font: serif, color: ink });
    y -= 22;
    page.drawLine({ start: { x: 64, y: y + 14 }, end: { x: 531, y: y + 14 }, thickness: 0.3, color: rgb(0.8, 0.78, 0.72) });
  }

  y -= 50;
  page.drawText("Approved by", { x: 360, y, size: 10, font: sans, color: navy });
  y -= 36;
  page.drawText(clean(hod?.full_name ?? "Head of Department"), { x: 360, y, size: 12.5, font: serifB, color: ink });
  y -= 16;
  page.drawText("Head of Department", { x: 360, y, size: 10.5, font: serif, color: ink });
  y -= 14;
  page.drawText(clean(`${c?.departments?.name ?? ""}`), { x: 360, y, size: 10.5, font: serif, color: ink });
  y -= 14;
  page.drawText(clean(`Digitally approved on ${fmtDate(r.decided_at)} via ${SITE.name}`), { x: 360, y, size: 8.5, font: serif, color: rgb(0.4, 0.4, 0.45) });

  page.drawText(`${SITE.name}  |  Ref ${ref}  |  Powered by yatsu`, { x: 64, y: 50, size: 8.5, font: serif, color: rgb(0.4, 0.4, 0.45) });

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="NOC-${st?.univ_roll_no}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
