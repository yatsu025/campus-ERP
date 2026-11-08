import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, strParam, toNum } from "@/lib/utils";
import { Badge, Card, CardHeader, EmptyState, PageHeader, TableWrap } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "My marks" };

type Cell = { marks: number; max: number } | undefined;

export default async function StudentMarks({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole("student");
  const sp = await searchParams;
  const supabase = await createClient();
  const current = user.student!.semester;
  const reqSem = Number(strParam(sp.sem, 2));
  const sem = Number.isInteger(reqSem) && reqSem >= 1 && reqSem <= 12 ? reqSem : current;

  // Due to RLS, only PUBLISHED marks are returned
  const { data } = await supabase
    .from("marks")
    .select("exam_type,marks,max_marks,subjects!inner(code,name,semester)")
    .eq("student_id", user.student!.id)
    .eq("subjects.semester", sem);

  const bySubject = new Map<string, { code: string; name: string; ST1?: Cell; ST2?: Cell; INTERNAL?: Cell }>();
  for (const r of data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s: any = r.subjects;
    const row = bySubject.get(s.code) ?? { code: s.code, name: s.name };
    (row as Record<string, unknown>)[r.exam_type] = { marks: toNum(r.marks), max: toNum(r.max_marks) };
    bySubject.set(s.code, row);
  }
  const rows = [...bySubject.values()].sort((a, b) => a.code.localeCompare(b.code));
  const sems = Array.from({ length: Math.max(current, 1) }, (_, i) => i + 1);

  const show = (c: Cell) =>
    c ? (
      <span className="font-semibold text-navy-900">
        {c.marks} <span className="font-normal text-muted">/ {c.max}</span>
      </span>
    ) : (
      <span className="text-muted">-</span>
    );

  return (
    <>
      <PageHeader kicker="Sessional marks" title="My marks" description="Only the marks published by the HOD are shown." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-muted">Semester</span>
        {sems.map((s) => (
          <Link key={s} href={`?sem=${s}`} className={cn("badge !px-3 !py-1 !text-sm", s === sem ? "badge-info" : "badge-mute")}>
            {s}
          </Link>
        ))}
      </div>
      <Card>
        <CardHeader title={`Semester ${sem}`} action={sem === current ? <Badge tone="info">Current</Badge> : undefined} />
        {rows.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th className="th">Subject</th>
                <th className="th">ST1</th>
                <th className="th">ST2</th>
                <th className="th">Internal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code}>
                  <td className="td">
                    <p className="font-semibold text-navy-900">{r.name}</p>
                    <p className="text-xs text-muted">{r.code}</p>
                  </td>
                  <td className="td">{show(r.ST1)}</td>
                  <td className="td">{show(r.ST2)}</td>
                  <td className="td">{show(r.INTERNAL)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <EmptyState title="Marks for this semester have not been published yet" text="They will appear here as soon as they are published, and you will receive a notification." />
        )}
      </Card>
    </>
  );
}
