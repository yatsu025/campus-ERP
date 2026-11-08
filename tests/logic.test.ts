import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDate } from "../src/lib/dates";
import { readSheet, buildWorkbook, SheetError } from "../src/lib/sheets";
import { analyzeRequestFields, riskFromFlags, sniffMime, analyzeFile } from "../src/lib/noc-checks";
import { classesToReach, portalState } from "../src/lib/data";
import { safeNext } from "../src/lib/action";
import { PDFDocument } from "pdf-lib";

const COLS = { roll: ["University Roll No"], date: ["Date"], subject: ["Subject Code"], status: ["Present/Absent"] };
const file = (buf: Buffer | string, name: string) => new File([buf as BlobPart], name);

test("parseDate formats + invalid", () => {
  assert.equal(parseDate("2026-11-07"), "2026-11-07");
  assert.equal(parseDate("07-11-2026"), "2026-11-07");
  assert.equal(parseDate("07/11/2026"), "2026-11-07");
  assert.equal(parseDate("2026-02-30"), null);
  assert.equal(parseDate("abc"), null);
});

test("xlsx roundtrip: template -> readSheet", async () => {
  const buf = await buildWorkbook({ sheetName: "A", headers: ["University Roll No", "Student Name", "Date", "Subject Code", "Present/Absent"], rows: [["97240065", "X", "2026-11-03", "BCA101", "Present"], ["97240066", "Y", "2026-11-03", "BCA101", null]], dropdowns: [{ col: 5, list: ["Present", "Absent"] }] });
  const s = await readSheet(file(buf, "a.xlsx"), COLS);
  assert.equal(s.rows.length, 2);
  assert.equal(s.rows[0]!.cells.roll, "97240065");
  assert.equal(s.rows[0]!.cells.status, "Present");
  assert.equal(s.rows[1]!.cells.status, "");
});

test("csv works, wrong header + fake xlsx + wrong ext rejected", async () => {
  const s = await readSheet(file("University Roll No,Date,Subject Code,Present/Absent\n97240065,03-11-2026,BCA101,A\n", "a.csv"), COLS);
  assert.equal(s.rows[0]!.cells.status, "A");
  await assert.rejects(readSheet(file("x,y\n1,2\n", "a.csv"), COLS), SheetError);
  await assert.rejects(readSheet(file("not a zip", "a.xlsx"), COLS), SheetError);
  await assert.rejects(readSheet(file("a", "a.exe"), COLS), SheetError);
  await assert.rejects(readSheet(null, COLS), SheetError);
});

test("noc form flags + risk", () => {
  const f = analyzeRequestFields({ companyEmail: "hr@gmail.com", companyWebsite: null, startDate: "2026-12-01", endDate: "2028-01-01", now: new Date("2026-11-08") });
  const codes = f.map((x) => x.code);
  assert.ok(codes.includes("free_email") && codes.includes("long_duration") && codes.includes("no_website"));
  assert.equal(riskFromFlags(f), "high");
  const clean = analyzeRequestFields({ companyEmail: "hr@acme.com", companyWebsite: "https://www.acme.com", startDate: "2026-12-01", endDate: "2027-01-15", now: new Date("2026-11-08") });
  assert.equal(riskFromFlags(clean), "low");
  const mism = analyzeRequestFields({ companyEmail: "hr@acme.com", companyWebsite: "https://other.org", startDate: "2026-12-01", endDate: "2027-01-15", now: new Date("2026-11-08") });
  assert.ok(mism.some((x) => x.code === "domain_mismatch"));
});

test("file sniffing + pdf analysis", async () => {
  assert.equal(sniffMime(Buffer.from("MZ....")), null);
  assert.equal(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  const doc = await PDFDocument.create(); doc.setProducer("iLovePDF"); doc.addPage();
  const pdf = Buffer.from(await doc.save());
  assert.equal(sniffMime(pdf), "application/pdf");
  const r = await analyzeFile(pdf, "application/pdf");
  assert.ok(r.flags.some((f) => f.code === "editor_tool"));
  const evil = Buffer.concat([pdf, Buffer.from("\n/JavaScript (app.alert(1))\n%%EOF")]);
  const r2 = await analyzeFile(evil, "application/pdf");
  assert.ok(r2.flags.some((f) => f.code === "active_content") && r2.flags.some((f) => f.code === "edited_after_creation"));
});

test("attendance math, portal window, safeNext", () => {
  assert.equal(classesToReach(10, 7), 2); // 9/12 = 75%
  assert.equal(classesToReach(10, 8), 0);
  assert.equal(portalState(null).open, false);
  assert.equal(portalState({ open_date: "2000-01-01", close_date: "2099-01-01", required_docs: [] }).open, true);
  assert.equal(safeNext("//evil.com"), "/dashboard");
  assert.equal(safeNext("https://evil.com"), "/dashboard");
  assert.equal(safeNext("/student/marks"), "/student/marks");
});
