import { Download } from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ATTENDANCE_THRESHOLD, PAGE_SIZE } from "@/lib/constants";
import { attendanceReport } from "@/lib/reports";
import { allowedSubjects, subjectLabel } from "@/lib/scope";
import { isUuid, pageParam, strParam } from "@/lib/utils";
import { Card, DownloadLink, EmptyState, Pagination, PercentBadge, TableWrap } from "@/components/ui/primitives";

export async function AttendanceReportPanel({ user, searchParams, basePath }: { user: SessionUser; searchParams: Record<string, string | string[] | undefined>; basePath: string }) {
  const subjectId = strParam(searchParams.subject, 40);
  const sectionId = strParam(searchParams.section, 40);
  const view = strParam(searchParams.view, 5) === "all" ? "all" : "low";
  const page = pageParam(searchParams.page);

  const supabase = await createClient();
  const subjects = await allowedSubjects(user);
  const courseIds = [...new Set(subjects.map((s) => s.course_id))];
  const { data: sections } = courseIds.length ? await supabase.from("sections").select("id,name,semester,courses(code)").in("course_id", courseIds).order("semester").order("name") : { data: [] };

  const filters = { subjectId: isUuid(subjectId) ? subjectId : undefined, sectionId: isUuid(sectionId) ? sectionId : undefined, view } as const;
  const { rows, total } = await attendanceReport(filters, { from: (page - 1) * PAGE_SIZE, to: page * PAGE_SIZE - 1 });
  const qs = new URLSearchParams({ view });
  if (filters.subjectId) qs.set("subject", filters.subjectId);
  if (filters.sectionId) qs.set("section", filters.sectionId);

  return (
    <>
      <form method="get" className="card mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_0.8fr_auto]">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted" htmlFor="subject">Subject</label>
          <select id="subject" name="subject" className="input" defaultValue={filters.subjectId ?? ""}>
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{subjectLabel(s)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted" htmlFor="section">Section</label>
          <select id="section" name="section" className="input" defaultValue={filters.sectionId ?? ""}>
            <option value="">All sections</option>
            {(sections ?? []).map((s) => (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              <option key={s.id} value={s.id}>{(s.courses as any)?.code} · Sem {s.semester} · {s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted" htmlFor="view">Show</label>
          <select id="view" name="view" className="input" defaultValue={view}>
            <option value="low">Only below {ATTENDANCE_THRESHOLD}%</option>
            <option value="all">All</option>
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button className="btn btn-primary">Filter</button>
          <DownloadLink href={`/api/exports/attendance?${qs.toString()}`}>
            <Download className="size-4" /> Excel
          </DownloadLink>
        </div>
      </form>

      <Card>
        {rows.length ? (
          <>
            <TableWrap>
              <thead>
                <tr>
                  <th className="th">Roll No.</th>
                  <th className="th">Student</th>
                  <th className="th">Subject</th>
                  <th className="th">Present / Total</th>
                  <th className="th">%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.roll}${r.subject}${i}`}>
                    <td className="td font-semibold text-navy-900">{r.roll}</td>
                    <td className="td">{r.name}</td>
                    <td className="td">
                      {r.subject} <span className="text-xs text-muted">{r.subjectName}</span>
                    </td>
                    <td className="td">{r.present} / {r.total}</td>
                    <td className="td"><PercentBadge value={r.percentage} /></td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <Pagination page={page} total={total} basePath={basePath} params={Object.fromEntries(qs)} />
          </>
        ) : (
          <EmptyState title={view === "low" ? "No student below 75%" : "No attendance record found"} text="Try changing the filter or upload attendance." />
        )}
      </Card>
    </>
  );
}
