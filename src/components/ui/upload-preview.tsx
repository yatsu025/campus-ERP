import { Check, X } from "lucide-react";
import type { ActionState } from "@/lib/action";
import { cn } from "@/lib/utils";
import { discardUpload } from "@/app/actions/uploads";
import { ActionForm, CredentialsResult, SubmitButton } from "@/components/ui/form";
import { Alert, Badge, Card, CardHeader, TableWrap } from "@/components/ui/primitives";

type PreviewRow = { line: number; error?: string; action?: string; [k: string]: unknown };

/**
 * Upload PREVIEW: before anything is saved to the database.
 * Red rows = errors (they are skipped on confirm). Data comes from the DB, not the browser.
 */
export function UploadPreview({
  log,
  columns,
  confirmAction,
  backPath,
  confirmLabel = "Confirm and save",
}: {
  log: { id: string; file_name: string; rows_total: number; rows_ok: number; rows_failed: number; payload: unknown; status: string };
  columns: { key: string; label: string }[];
  confirmAction: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  backPath: string;
  confirmLabel?: string;
}) {
  const rows = (Array.isArray(log.payload) ? log.payload : []) as PreviewRow[];
  const bad = rows.filter((r) => r.error);
  const good = rows.filter((r) => !r.error);
  const shown = [...bad.slice(0, 150), ...good.slice(0, 100)];
  const updates = good.filter((r) => r.action === "update").length;

  if (log.status !== "previewed") {
    return <Alert tone="info">This upload has already been processed.</Alert>;
  }

  return (
    <Card>
      <CardHeader
        title="Preview: nothing saved yet"
        subtitle={log.file_name}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="ok">{log.rows_ok} valid</Badge>
            {updates > 0 && <Badge tone="info">{updates} update</Badge>}
            <Badge tone={log.rows_failed ? "bad" : "mute"}>{log.rows_failed} invalid</Badge>
          </div>
        }
      />
      {log.rows_failed > 0 && (
        <div className="border-b border-line p-4">
          <Alert tone="warn" title="Some rows are invalid">
            Red rows will be skipped on confirm. It is better to fix the sheet and upload it again.
          </Alert>
        </div>
      )}
      <TableWrap className="max-h-[28rem]">
        <thead className="sticky top-0">
          <tr>
            <th className="th">Row</th>
            {columns.map((c) => (
              <th key={c.key} className="th">
                {c.label}
              </th>
            ))}
            <th className="th">Result</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i} className={cn(r.error && "bg-[#fdf0ee]")}>
              <td className="td text-muted">{r.line}</td>
              {columns.map((c) => (
                <td key={c.key} className="td">
                  {String(r[c.key] ?? "-")}
                </td>
              ))}
              <td className="td">
                {r.error ? (
                  <span className="flex items-start gap-1.5 text-xs font-medium text-bad">
                    <X className="mt-0.5 size-3.5 shrink-0" /> {r.error}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-ok">
                    <Check className="size-3.5" /> {r.action === "update" ? "Will update" : r.action === "same" ? "Already same" : "New"}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      {rows.length > shown.length && <p className="border-t border-line px-5 py-2 text-xs text-muted">Showing the first {shown.length} rows (of {rows.length}). All valid rows will be saved on confirm.</p>}
      <div className="flex flex-wrap items-start gap-3 border-t border-line p-4">
        {log.rows_ok > 0 && (
          <ActionForm action={confirmAction} className="w-full !space-y-3">
            <input type="hidden" name="upload_id" value={log.id} />
            <SubmitButton variant="accent" pendingText="Saving…">
              {confirmLabel} ({log.rows_ok})
            </SubmitButton>
            <CredentialsResult />
          </ActionForm>
        )}
        <ActionForm action={discardUpload} className="!space-y-0">
          <input type="hidden" name="upload_id" value={log.id} />
          <input type="hidden" name="back" value={backPath} />
          <SubmitButton variant="ghost">Discard</SubmitButton>
        </ActionForm>
      </div>
    </Card>
  );
}
