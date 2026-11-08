import "server-only";
import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { MAX_SHEET_BYTES, MAX_SHEET_ROWS } from "@/lib/constants";
import { parseDate } from "@/lib/dates";

export { parseDate };

/**
 * Core of the upload engine. Reads both Excel (.xlsx) and CSV, entirely on the SERVER.
 * The browser only sends the file; what is correct and what is not is decided here.
 */

export class SheetError extends Error {}

export type SheetRow = { line: number; cells: Record<string, string> };
export type ParsedSheet = { rows: SheetRow[] };

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** .xlsx is a zip. Check the uncompressed size to avoid zip bombs. */
function assertZipSafe(buf: Buffer) {
  const MAX_UNCOMPRESSED = 60 * 1024 * 1024;
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new SheetError("The file is corrupt or is not a valid .xlsx.");
  const entries = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  let total = 0;
  if (entries > 500) throw new SheetError("The file contains too many internal parts.");
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== 0x02014b50) throw new SheetError("The file is corrupt.");
    total += buf.readUInt32LE(offset + 24);
    const n = buf.readUInt16LE(offset + 28);
    const m = buf.readUInt16LE(offset + 30);
    const k = buf.readUInt16LE(offset + 32);
    offset += 46 + n + m + k;
  }
  if (total > MAX_UNCOMPRESSED) throw new SheetError("The file is too large (when decompressed).");
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  }
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if ("result" in o) return cellText(o.result as ExcelJS.CellValue);
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("").trim();
    if ("text" in o) return String(o.text ?? "").trim();
    return "";
  }
  return String(v).trim();
}

/**
 * @param columns canonical key -> accepted header names (matched in normalised form)
 */
export async function readSheet(file: File | null, columns: Record<string, string[]>): Promise<ParsedSheet> {
  if (!file || typeof file === "string" || file.size === 0) throw new SheetError("Please select a file first.");
  if (file.size > MAX_SHEET_BYTES) throw new SheetError(`The file is larger than ${MAX_SHEET_BYTES / 1024 / 1024}MB.`);

  const name = file.name.toLowerCase();
  const isXlsx = name.endsWith(".xlsx");
  const isCsv = name.endsWith(".csv");
  if (!isXlsx && !isCsv) throw new SheetError("Only .xlsx or .csv files are allowed (for a Google Sheet, use File > Download > Excel/CSV and upload it).");

  const buf = Buffer.from(await file.arrayBuffer());
  const wb = new ExcelJS.Workbook();

  try {
    if (isXlsx) {
      if (buf.readUInt32BE(0) !== 0x504b0304) throw new SheetError("This is not a genuine .xlsx file.");
      assertZipSafe(buf);
      await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
    } else {
      if (buf.subarray(0, 2048).includes(0)) throw new SheetError("This is not a genuine CSV file.");
      await wb.csv.read(Readable.from(buf));
    }
  } catch (e) {
    if (e instanceof SheetError) throw e;
    throw new SheetError("Could not read the file. Download the template and enter the data in it.");
  }

  const ws = wb.worksheets[0];
  if (!ws) throw new SheetError("No sheet found in the file.");
  if (ws.rowCount - 1 > MAX_SHEET_ROWS + 50) throw new SheetError(`At most ${MAX_SHEET_ROWS} rows can be uploaded at once.`);

  // header mapping
  const headerRow = ws.getRow(1);
  const colIndex: Record<string, number> = {};
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    const key = norm(cellText(cell.value));
    for (const [canon, aliases] of Object.entries(columns)) {
      if (!(canon in colIndex) && aliases.map(norm).includes(key)) colIndex[canon] = col;
    }
  });
  const missing = Object.entries(columns)
    .filter(([canon]) => !(canon in colIndex))
    .map(([, aliases]) => aliases[0]);
  if (missing.length) {
    throw new SheetError(`These columns were not found: ${missing.join(", ")}. Keep the template headers exactly as they are.`);
  }

  const rows: SheetRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, line) => {
    if (line === 1) return;
    const cells: Record<string, string> = {};
    let any = false;
    for (const [canon, col] of Object.entries(colIndex)) {
      const text = cellText(row.getCell(col).value);
      cells[canon] = text;
      if (text) any = true;
    }
    if (any) rows.push({ line, cells }); // skip empty rows
  });

  if (rows.length === 0) throw new SheetError("No data rows found in the file.");
  if (rows.length > MAX_SHEET_ROWS) throw new SheetError(`At most ${MAX_SHEET_ROWS} rows can be uploaded at once.`);
  return { rows };
}

/* ------------------------------------------------------------------ */
/*  Template / export builder                                          */
/* ------------------------------------------------------------------ */

export async function buildWorkbook(opts: {
  sheetName: string;
  headers: string[];
  rows: (string | number | null)[][];
  dropdowns?: { col: number; list: string[] }[]; // col 1-based
  notes?: string[];
  widths?: number[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Campus ERP | yatsu";
  const ws = wb.addWorksheet(opts.sheetName);
  ws.addRow(opts.headers);
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1F4A" } };
  head.height = 22;
  ws.views = [{ state: "frozen", ySplit: 1 }];
  opts.headers.forEach((_, i) => (ws.getColumn(i + 1).width = opts.widths?.[i] ?? 22));
  for (const r of opts.rows) ws.addRow(r);
  const last = Math.max(opts.rows.length + 1, 300);
  for (const dd of opts.dropdowns ?? []) {
    for (let r = 2; r <= Math.min(last, 5001); r++) {
      ws.getCell(r, dd.col).dataValidation = { type: "list", allowBlank: true, formulae: [`"${dd.list.join(",")}"`] };
    }
  }
  if (opts.notes?.length) {
    const n = wb.addWorksheet("Instructions");
    n.getColumn(1).width = 100;
    opts.notes.forEach((t, i) => (n.getCell(i + 1, 1).value = t));
    n.getCell(1, 1).font = { bold: true };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function xlsxResponse(buf: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
