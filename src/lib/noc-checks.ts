import "server-only";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";

/**
 * NOC V1 document checks (doc section 10.3). This is an "assistant": it surfaces red flags.
 * It cannot say with 100% certainty whether a document is genuine, so the FINAL DECISION IS ALWAYS THE HOD'S.
 */

export type Flag = { code: string; severity: "low" | "medium" | "high"; message: string };
export type Risk = "low" | "medium" | "high";

export const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

/** Determine the file's real type from its first bytes (do not trust the extension/Content-Type). */
export function sniffMime(buf: Buffer): "application/pdf" | "image/png" | "image/jpeg" | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  return null;
}

export const EXT_FOR: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" };

const FREE_EMAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.in", "yahoo.co.in", "ymail.com", "outlook.com", "hotmail.com",
  "live.com", "msn.com", "rediffmail.com", "proton.me", "protonmail.com", "icloud.com", "aol.com", "mail.com",
  "zoho.com", "gmx.com", "yandex.com", "tutanota.com",
]);

const ONLINE_EDITORS = /(ilovepdf|smallpdf|sejda|pdfescape|pdf24|pdfcandy|canva|photoshop|illustrator|gimp|inkscape|pdffiller|docfly|online2pdf)/i;

export function riskFromFlags(flags: Flag[]): Risk {
  const score = flags.reduce((s, f) => s + (f.severity === "high" ? 4 : f.severity === "medium" ? 2 : 1), 0);
  if (score >= 4) return "high";
  if (score >= 2) return "medium";
  return "low";
}

const domainOf = (host: string) => host.toLowerCase().replace(/^www\./, "");

/** Checks on the form details: email domain, website match, dates */
export function analyzeRequestFields(r: {
  companyEmail: string;
  companyWebsite?: string | null;
  startDate: string;
  endDate: string;
  now?: Date;
}): Flag[] {
  const flags: Flag[] = [];
  const emailDomain = domainOf(r.companyEmail.split("@")[1] ?? "");

  if (FREE_EMAIL.has(emailDomain)) {
    flags.push({
      code: "free_email",
      severity: "medium",
      message: `The company email uses a free service (${emailDomain}). An email on the official company domain is expected.`,
    });
  }

  if (r.companyWebsite) {
    try {
      const host = domainOf(new URL(r.companyWebsite).hostname);
      const related = host === emailDomain || host.endsWith(`.${emailDomain}`) || emailDomain.endsWith(`.${host}`);
      if (!related && !FREE_EMAIL.has(emailDomain)) {
        flags.push({
          code: "domain_mismatch",
          severity: "medium",
          message: `The email domain (${emailDomain}) and website (${host}) do not match.`,
        });
      }
    } catch {
      flags.push({ code: "bad_website", severity: "low", message: "The company website URL does not look valid." });
    }
  } else {
    flags.push({ code: "no_website", severity: "low", message: "No company website provided; verification will be harder." });
  }

  const start = new Date(`${r.startDate}T00:00:00Z`).getTime();
  const end = new Date(`${r.endDate}T00:00:00Z`).getTime();
  const now = (r.now ?? new Date()).getTime();
  const days = Math.round((end - start) / 86400000) + 1;
  if (days > 365) {
    flags.push({ code: "long_duration", severity: "medium", message: `The internship is ${days} days long, which is more than 1 year.` });
  }
  if (start < now - 30 * 86400000) {
    flags.push({ code: "backdated", severity: "medium", message: "The internship start date is more than 30 days old (backdated request)." });
  }
  return flags;
}

export type FileAnalysis = { flags: Flag[]; meta: Record<string, unknown> };

/** Inspection of an uploaded document: type, PDF metadata, editing history, active content */
export async function analyzeFile(buf: Buffer, mime: string, now = new Date()): Promise<FileAnalysis> {
  const flags: Flag[] = [];
  const meta: Record<string, unknown> = { mime, bytes: buf.length };

  if (mime !== "application/pdf") {
    flags.push({
      code: "image_proof",
      severity: "low",
      message: "The document is an image. Verification is easier when the original PDF is available.",
    });
    return { flags, meta };
  }

  const raw = buf.toString("latin1");
  const eofCount = (raw.match(/%%EOF/g) ?? []).length;
  meta.revisions = eofCount;
  if (eofCount > 1) {
    flags.push({
      code: "edited_after_creation",
      severity: "medium",
      message: `${eofCount} revisions found in the PDF: the file was edited/saved after it was created.`,
    });
  }
  if (/\/(JavaScript|JS|Launch|EmbeddedFile)\b/.test(raw)) {
    flags.push({ code: "active_content", severity: "high", message: "The PDF contains a script/embedded file. Do not open it to view; the HOD should check carefully." });
  }

  try {
    const pdf = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
    const producer = pdf.getProducer() ?? "";
    const creator = pdf.getCreator() ?? "";
    const created = pdf.getCreationDate();
    const modified = pdf.getModificationDate();
    meta.producer = producer || null;
    meta.creator = creator || null;
    meta.created = created?.toISOString() ?? null;
    meta.modified = modified?.toISOString() ?? null;
    meta.pages = pdf.getPageCount();

    if (ONLINE_EDITORS.test(`${producer} ${creator}`)) {
      flags.push({
        code: "editor_tool",
        severity: "medium",
        message: `The PDF was produced by an editing/design tool (${producer || creator}). It does not look like the output of an official HR system.`,
      });
    }
    if (!producer && !creator && !created) {
      flags.push({ code: "no_metadata", severity: "low", message: "The PDF metadata appears to have been removed." });
    }
    if (created && created.getTime() > now.getTime() + 86400000) {
      flags.push({ code: "future_date", severity: "high", message: "The PDF creation date is in the future, which is not possible." });
    }
    if (created && modified && modified.getTime() - created.getTime() > 86400000) {
      flags.push({
        code: "modified_later",
        severity: "medium",
        message: "The PDF was modified more than 1 day after it was created.",
      });
    }
  } catch {
    flags.push({ code: "unreadable_pdf", severity: "medium", message: "The PDF structure could not be fully read (it may be corrupt or manipulated)." });
  }
  return { flags, meta };
}
