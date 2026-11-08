export const SITE = {
  name: "Campus ERP",
  group: "United Group of Institutions",
  tagline: "Attendance, Sessional Marks and NOC: all in one place",
  city: "Prayagraj",
  phone: "1800 3131 808",
  email: "info@united.ac.in",
  poweredBy: "yatsu",
} as const;

// Doc section 10.1: alert when below 75%
export const ATTENDANCE_THRESHOLD = 75;

export const EXAM_TYPES = ["ST1", "ST2", "INTERNAL"] as const;
export type ExamType = (typeof EXAM_TYPES)[number];
export const EXAM_LABEL: Record<ExamType, string> = {
  ST1: "Sessional Test 1",
  ST2: "Sessional Test 2",
  INTERNAL: "Internal",
};

export const NOC_DOC_TYPES = {
  offer_letter: "Offer / Appointment Letter",
  college_id: "College ID Card",
  company_id: "Company ID / Joining Proof",
  resume: "Resume",
  parent_consent: "Parent Consent Letter",
  other: "Other Supporting Document",
} as const;
export type NocDocType = keyof typeof NOC_DOC_TYPES;
export const DEFAULT_NOC_DOCS: NocDocType[] = ["offer_letter", "college_id"];

export const NOC_STATUS_LABEL = {
  draft: "Draft",
  applied: "Applied",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Rejected",
} as const;

export const ROLE_LABEL = {
  student: "Student",
  teacher: "Teacher",
  hod: "Head of Department",
  admin: "Administrator",
} as const;
export type Role = keyof typeof ROLE_LABEL;

// Upload limits (Vercel's request limit is ~4.5MB)
export const MAX_SHEET_BYTES = 3 * 1024 * 1024;
export const MAX_SHEET_ROWS = 5000;
export const MAX_NOC_FILE_BYTES = 3 * 1024 * 1024;
export const PAGE_SIZE = 20;

export const RISK_TONE = { low: "ok", medium: "warn", high: "bad" } as const;
