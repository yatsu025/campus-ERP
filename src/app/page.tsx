import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarCheck, ClipboardList, FileCheck2, Mail, Phone, ShieldCheck } from "lucide-react";
import { SITE } from "@/lib/constants";
import { getSessionUser, homeFor } from "@/lib/auth";
import { BrandLogo, PoweredBy } from "@/components/ui/primitives";

async function currentHome(): Promise<string | null> {
  try {
    const u = await getSessionUser();
    return u ? homeFor(u.role) : null;
  } catch {
    return null; // env not configured: home should still load
  }
}

// Facts as listed on United Group's own login page
const FACTS = [
  { n: "1951", l: "Founded" },
  { n: "08", l: "Institutes" },
  { n: "11,200+", l: "Students" },
  { n: "750+", l: "Faculty" },
  { n: "14,000+", l: "Alumni" },
];

const MODULES = [
  {
    n: "01",
    icon: CalendarCheck,
    title: "Attendance",
    text: "The HOD uploads the sheet and the system identifies students by University Roll No. Preview, confirm, done.",
    points: ["Subject-wise %", "Alert below 75%", "Section changes, record doesn't"],
  },
  {
    n: "02",
    icon: ClipboardList,
    title: "Sessional Marks",
    text: "Teachers or the HOD upload ST1, ST2 and Internal marks. Students see marks only after the HOD publishes them.",
    points: ["Publish / Lock", "Full version history", "Students see only their own marks"],
  },
  {
    n: "03",
    icon: FileCheck2,
    title: "NOC",
    text: "Form, documents, red-flag checks and the HOD's decision. No running around; the status is tracked live.",
    points: ["Documents stay private", "Risk: Low / Medium / High", "Approve or Reject + remark"],
  },
];

export default async function HomePage() {
  const home = await currentHome();

  return (
    <div className="bg-paper">
      {/* ------------------------------ HERO ------------------------------ */}
      <section className="bg-grid relative overflow-hidden bg-navy-900 text-white">
        <div className="pointer-events-none absolute -left-24 top-1/3 size-[28rem] rounded-full bg-navy-700/40 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <nav className="flex items-center justify-between py-5">
            <div className="flex items-center gap-3 rounded-lg bg-white px-3 py-1.5 shadow-[0_2px_0_rgb(0_0_0/.25)]">
              <BrandLogo priority className="h-9 sm:h-10" />
            </div>
            <Link href={home ?? "/login"} className="btn btn-accent">
              {home ? "Open dashboard" : "Login"} <ArrowRight className="size-4" />
            </Link>
          </nav>

          <div className="grid items-center gap-10 pb-16 pt-8 lg:grid-cols-[1.15fr_0.85fr] lg:pb-24 lg:pt-14">
            <div>
              <p className="kicker rise !text-white/70">
                <span className="mr-2 inline-block h-[2px] w-8 translate-y-[-3px] bg-crimson" />
                {SITE.group} · {SITE.city}
              </p>
              <h1 className="rise rise-2 mt-5 text-[2.6rem] font-semibold leading-[1.04] sm:text-6xl lg:text-[4.4rem]">
                Attendance, marks and NOC.
                <span className="mt-2 block italic text-white/80">From a single roll number.</span>
              </h1>
              <p className="rise rise-3 mt-6 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
                An ERP built on University Roll Numbers instead of sequences and offline paperwork. Sections change every semester, but each student's record stays the same.
              </p>
              <div className="rise rise-4 mt-8 flex flex-wrap gap-3">
                <Link href={home ?? "/login"} className="btn btn-accent !px-6 !py-3 !text-base">
                  {home ? "Open dashboard" : "Log in"} <ArrowRight className="size-4" />
                </Link>
                <a href="#modules" className="btn !border-white/25 !px-6 !py-3 !text-base text-white hover:bg-white/10">
                  What you get
                </a>
              </div>
            </div>

            {/* campus photo with the red tab */}
            <div className="rise rise-3 relative mx-auto w-full max-w-md lg:max-w-none">
              <div className="absolute -bottom-3 -right-3 h-full w-full rounded-2xl bg-crimson" />
              <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-navy-950">
                <Image src="/brand/campus.jpg" alt="United Group campus building" width={605} height={198} priority className="h-auto w-full" />
                <div className="bg-gradient-to-t from-navy-950 to-navy-900 px-5 py-4">
                  <p className="font-display text-lg font-semibold">{SITE.group}</p>
                  <p className="text-xs text-white/60">Greater Noida · Allahabad (Prayagraj)</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* facts strip */}
        <div className="relative border-t border-white/10 bg-navy-950/60">
          <dl className="mx-auto grid max-w-7xl grid-cols-2 gap-y-5 px-4 py-6 sm:grid-cols-5 sm:px-6">
            {FACTS.map((f) => (
              <div key={f.l} className="text-center sm:border-r sm:border-white/10 sm:last:border-0">
                <dt className="sr-only">{f.l}</dt>
                <dd className="font-display text-3xl font-semibold">{f.n}</dd>
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-white/55">{f.l}</p>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ----------------------------- MODULES ---------------------------- */}
      <section id="modules" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <p className="kicker">Three jobs, one system</p>
          <h2 className="mt-2 text-3xl font-semibold text-navy-900 sm:text-5xl">The three oldest headaches in college, solved.</h2>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {MODULES.map((m) => (
            <article key={m.n} className="card group relative flex flex-col overflow-hidden p-6 transition-shadow hover:shadow-[0_18px_40px_-24px_rgb(11_31_74/.55)]">
              <span className="font-display absolute -right-1 -top-4 text-[7rem] font-semibold leading-none text-paper-2 transition-colors group-hover:text-[#f0dedd]">{m.n}</span>
              <m.icon className="relative size-8 text-crimson" strokeWidth={1.6} />
              <h3 className="relative mt-5 text-2xl font-semibold text-navy-900">{m.title}</h3>
              <p className="relative mt-2 flex-1 text-sm leading-relaxed text-muted">{m.text}</p>
              <ul className="relative mt-5 space-y-1.5 border-t border-line pt-4 text-sm font-medium text-navy-800">
                {m.points.map((p) => (
                  <li key={p} className="flex gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-crimson" />
                    {p}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* --------------------------- ROLL NUMBER IDEA --------------------- */}
      <section className="border-y border-line bg-paper-2">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2">
          <div>
            <p className="kicker">Core idea</p>
            <h2 className="mt-2 text-3xl font-semibold text-navy-900 sm:text-4xl">Not sequence. Roll number.</h2>
            <p className="mt-4 max-w-lg leading-relaxed text-muted">
              In older ERPs, attendance was recorded in a fixed sequence. In our college sections change every semester, so the sequence broke and attendance was applied to the wrong student.
              Here every row is matched by its own University Roll Number; the section is only for grouping.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="card p-5">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-bad">Before</p>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                <li>Attendance by sequence; data goes wrong when a section changes</li>
                <li>Marks entered manually, over and over</li>
                <li>Offline NOC with no status visibility</li>
                <li>No record of who changed what</li>
              </ul>
            </div>
            <div className="card border-navy-900 bg-navy-900 p-5 text-white">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/60">After</p>
              <ul className="mt-3 space-y-2 text-sm text-white/85">
                <li>Auto-matched by roll number; the section doesn't matter</li>
                <li>Sheet upload, preview, confirm, publish</li>
                <li>NOC online, red flags and live status</li>
                <li>Audit log for every change</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------ SECURITY -------------------------- */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="card flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:p-8">
          <ShieldCheck className="size-12 shrink-0 text-navy-900" strokeWidth={1.4} />
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-navy-900">Student data is sensitive, and we keep it that way.</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Role-based access, Row Level Security on every table, private document storage, and an audit log for every important action. Students see only their own data; HODs see only their own department.
            </p>
          </div>
          <Link href={home ?? "/login"} className="btn btn-primary">
            {home ? "Open dashboard" : "Login"} <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      {/* ------------------------------ FOOTER ---------------------------- */}
      <footer className="bg-navy-950 text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-display text-xl font-semibold">{SITE.name}</p>
            <p className="text-sm text-white/60">{SITE.group}</p>
          </div>
          <div className="space-y-1.5 text-sm text-white/75">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/45">Support</p>
            <p className="flex items-center gap-2">
              <Phone className="size-4" /> {SITE.phone}
            </p>
            <p className="flex items-center gap-2">
              <Mail className="size-4" /> {SITE.email}
            </p>
          </div>
          <div className="md:text-right">
            <PoweredBy light />
            <p className="mt-1 text-xs text-white/40">© {new Date().getFullYear()} {SITE.group}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
