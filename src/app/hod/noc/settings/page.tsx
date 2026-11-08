import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_NOC_DOCS, NOC_DOC_TYPES } from "@/lib/constants";
import { portalState, type NocSettings } from "@/lib/data";
import { fmtDateTime } from "@/lib/utils";
import { saveNocSettings } from "../actions";
import { ActionForm, Field, SubmitButton } from "@/components/ui/form";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "NOC settings" };

export default async function NocSettingsPage() {
  const user = await requireRole("hod");
  const supabase = await createClient();
  const { data: s } = await supabase.from("noc_settings").select("open_date,close_date,required_docs,updated_at").eq("department_id", user.departmentId!).maybeSingle();
  const state = portalState(s as NocSettings);
  const selected = new Set((s?.required_docs as string[] | undefined) ?? DEFAULT_NOC_DOCS);

  return (
    <>
      <PageHeader kicker="NOC" title="NOC settings" description="When the portal opens and closes and which documents students must submit. These settings apply only to your department." />
      <div className="mb-5 flex items-center gap-3">
        <Badge tone={state.open ? "ok" : "bad"}>{state.open ? "Portal is currently open" : "Portal is currently closed"}</Badge>
        {s?.updated_at && <span className="text-xs text-muted">Last updated {fmtDateTime(s.updated_at)}</span>}
      </div>
      <Card className="max-w-2xl">
        <CardHeader title="Portal window and documents" />
        <div className="p-5">
          <ActionForm action={saveNocSettings}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="open_date" type="date" label="Open date" defaultValue={s?.open_date ?? ""} required />
              <Field name="close_date" type="date" label="Close date" defaultValue={s?.close_date ?? ""} required />
            </div>
            <fieldset>
              <legend className="mb-2 text-[0.8rem] font-semibold text-navy-900">Required documents</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(NOC_DOC_TYPES).map(([k, label]) => (
                  <label key={k} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-white px-3 py-2.5 text-sm has-[:checked]:border-navy-900 has-[:checked]:bg-[#eef2fb]">
                    <input type="checkbox" name="docs" value={k} defaultChecked={selected.has(k)} className="size-4 accent-[#0b1f4a]" />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <SubmitButton>Save settings</SubmitButton>
          </ActionForm>
        </div>
      </Card>
    </>
  );
}
