"use client";

import { createContext, useActionState, useContext, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import type { ActionState } from "@/lib/action";
import { cn } from "@/lib/utils";

const FormCtx = createContext<ActionState>(null);

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Every form is built from this: data goes to a Server Action, validation happens on the
 * SERVER, and the server's message/errors are shown here. `noValidate` is used so the
 * server's response is final instead of the browser's "required" popup.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  encType,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  encType?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} noValidate encType={encType} className={cn("space-y-4", className)}>
      <FormCtx.Provider value={state}>
        {state?.message && <FormMessage state={state} />}
        {children}
      </FormCtx.Provider>
    </form>
  );
}

export function FormMessage({ state }: { state: NonNullable<ActionState> }) {
  const ok = state.ok;
  return (
    <div
      role={ok ? "status" : "alert"}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm",
        ok ? "border-[#bfe3d0] bg-[#e9f6ef] text-ok" : "border-[#f0c3bf] bg-[#fdeeec] text-bad",
      )}
    >
      {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertCircle className="mt-0.5 size-4 shrink-0" />}
      <span className="whitespace-pre-line">{state.message}</span>
    </div>
  );
}

export function useFormState() {
  return useContext(FormCtx);
}

export function SubmitButton({
  children,
  variant = "primary",
  className,
  pendingText = "Please wait…",
  size,
}: {
  children: React.ReactNode;
  variant?: "primary" | "accent" | "ghost" | "danger";
  className?: string;
  pendingText?: string;
  size?: "sm";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn("btn", `btn-${variant}`, size === "sm" && "btn-sm", className)}
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" /> {pendingText}
        </>
      ) : (
        children
      )}
    </button>
  );
}

type Option = { value: string; label: string };

type FieldProps = {
  name: string;
  label: string;
  type?: string;
  as?: "input" | "select" | "textarea" | "password" | "file";
  options?: Option[];
  placeholder?: string;
  hint?: string;
  defaultValue?: string | number;
  required?: boolean;
  disabled?: boolean;
  accept?: string;
  autoComplete?: string;
  rows?: number;
  inputMode?: "text" | "numeric" | "email" | "tel";
  maxLength?: number;
  className?: string;
  min?: string | number;
  max?: string | number;
  step?: string | number;
};

export function Field(props: FieldProps) {
  const { name, label, as = "input", options, hint, required, className } = props;
  const state = useContext(FormCtx);
  const err = state?.fieldErrors?.[name]?.[0];
  const id = useId();
  const [show, setShow] = useState(false);

  const common = {
    id,
    name,
    "aria-invalid": err ? true : undefined,
    "aria-describedby": err || hint ? `${id}-msg` : undefined,
    disabled: props.disabled,
    className: "input",
  } as const;

  let control: React.ReactNode;
  if (as === "select") {
    control = (
      <select {...common} defaultValue={props.defaultValue ?? ""}>
        <option value="">{props.placeholder ?? "Select…"}</option>
        {options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else if (as === "textarea") {
    control = <textarea {...common} rows={props.rows ?? 4} placeholder={props.placeholder} defaultValue={props.defaultValue} maxLength={props.maxLength} />;
  } else if (as === "password") {
    control = (
      <div className="relative">
        <input
          {...common}
          type={show ? "text" : "password"}
          placeholder={props.placeholder}
          autoComplete={props.autoComplete ?? "current-password"}
          className="input pr-10"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted hover:text-navy-900"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    );
  } else if (as === "file") {
    control = (
      <input
        {...common}
        type="file"
        accept={props.accept}
        className="input cursor-pointer file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
      />
    );
  } else {
    control = (
      <input
        {...common}
        type={props.type ?? "text"}
        placeholder={props.placeholder}
        defaultValue={props.defaultValue}
        autoComplete={props.autoComplete}
        inputMode={props.inputMode}
        maxLength={props.maxLength}
        min={props.min}
        max={props.max}
        step={props.step}
      />
    );
  }

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[0.8rem] font-semibold text-navy-900">
        {label}
        {required && <span className="ml-0.5 text-crimson">*</span>}
      </label>
      {control}
      {(err || hint) && (
        <p id={`${id}-msg`} className={cn("mt-1 text-xs", err ? "text-bad" : "text-muted")}>
          {err ?? hint}
        </p>
      )}
    </div>
  );
}

/** For Admin: temporary passwords for new accounts (shown only once) + CSV download */
export function CredentialsResult() {
  const state = useContext(FormCtx);
  const creds = (state?.data as { credentials?: { name: string; email: string; rollNo: string; password: string }[] } | undefined)?.credentials;
  if (!creds?.length) return null;
  const csv = ["Name,Email,Roll No,Temporary Password", ...creds.map((c) => [c.name, c.email, c.rollNo, c.password].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
  return (
    <div className="rounded-lg border border-line bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <p className="text-xs font-bold uppercase tracking-wider text-navy-900">Temporary credentials</p>
        <a download="credentials.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`} className="btn btn-ghost btn-sm">CSV download</a>
      </div>
      <ul className="max-h-60 divide-y divide-line overflow-auto text-sm">
        {creds.map((c) => (
          <li key={c.email} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span>{c.name} <span className="text-xs text-muted">{c.rollNo || c.email}</span></span>
            <code className="rounded bg-paper-2 px-2 py-0.5 font-mono text-[0.8rem] font-bold text-navy-900">{c.password}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
