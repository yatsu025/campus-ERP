import { BrandLogo, PoweredBy } from "@/components/ui/primitives";

export function ErrorScreen({ code, title, text, children }: { code: string; title: string; text: string; children?: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper p-6">
      <div className="card rise w-full max-w-lg p-8 text-center sm:p-10">
        <BrandLogo className="mx-auto h-12" />
        <p className="font-display mt-6 text-[6rem] font-semibold leading-none text-navy-900">
          {code.split("").map((c, i) => (
            <span key={i} className={i === 1 ? "text-crimson" : ""}>
              {c}
            </span>
          ))}
        </p>
        <h1 className="mt-4 text-xl font-semibold text-navy-900">{title}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">{text}</p>
        <div className="mt-6">{children}</div>
        <PoweredBy className="mt-8" />
      </div>
    </main>
  );
}
