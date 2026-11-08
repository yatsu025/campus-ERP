import Image from "next/image";
import Link from "next/link";
import { Home, Mail, Phone } from "lucide-react";
import { SITE } from "@/lib/constants";
import { BrandLogo, PoweredBy } from "@/components/ui/primitives";

/** Shared frame for login / forgot / reset pages: college panel on the left, form on the right. */
export function AuthFrame({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main
      className="relative grid min-h-dvh place-items-center bg-navy-950 p-4 sm:p-8"
      style={{ backgroundImage: "radial-gradient(rgb(255 255 255 / .08) 1px, transparent 1px), linear-gradient(135deg, #06122f 0%, #0b1f4a 55%, #4a1216 100%)", backgroundSize: "22px 22px, 100% 100%" }}
    >
      <div className="rise grid w-full max-w-[68rem] overflow-hidden rounded-[1.25rem] bg-card shadow-[0_40px_80px_-30px_rgb(0_0_0/.6)] lg:grid-cols-[1.1fr_1fr]">
        {/* left: college panel */}
        <aside className="relative hidden flex-col bg-gradient-to-b from-navy-900 to-[#5b1519] text-white lg:flex">
          <Image src="/brand/campus.jpg" alt="United Group campus" width={605} height={198} priority className="h-auto w-full" />
          <div className="-mt-1 flex flex-1 flex-col px-9 pb-8 pt-7">
            <h2 className="text-[1.65rem] font-semibold leading-snug">Welcome to United Group Of Institutions</h2>
            <p className="mt-3 text-[0.9rem] leading-relaxed text-white/80">
              The United Group, founded by late Shri Shiv Ram Das Gulati in 1951 emerged from a transport business to the giants in the fields of education, services, transportation and journalism. The group made a mammoth leap in the education arena in the mid 80s by being the pioneers in computer education.
            </p>
            <p className="mt-3 text-[0.9rem] leading-relaxed text-white/80">
              Now, with 08 well established institutes in Allahabad and Greater Noida, over 11200 students and more than 750 faculty members, the United Group of Institutions is poised to reach the next level providing the best technical education.
            </p>
            <div className="mt-auto space-y-2 border-t border-white/15 pt-5 [&]:mt-8 text-sm text-white/80">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/50">For any support queries please contact us at</p>
              <p className="flex items-center gap-2">
                <Phone className="size-4" /> {SITE.phone}
              </p>
              <p className="flex items-center gap-2">
                <Mail className="size-4" /> {SITE.email}
              </p>
              <Link href="/" className="btn !mt-3 !border-white/30 text-white hover:bg-white/10">
                <Home className="size-4" /> Campus ERP Home
              </Link>
            </div>
          </div>
        </aside>

        {/* right: form */}
        <section className="flex flex-col justify-center px-6 py-10 sm:px-12">
          <div className="mx-auto w-full max-w-sm">
            <Link href="/" aria-label="Home" className="block">
              <BrandLogo variant="full" priority className="mx-auto h-14" />
            </Link>
            <div className="my-5 border-t border-line" />
            <h1 className="text-center text-2xl font-semibold text-navy-900">{title}</h1>
            {subtitle && <p className="mt-1.5 text-center text-sm text-muted">{subtitle}</p>}
            <div className="mt-6">{children}</div>
            {footer && <div className="mt-5 text-center text-sm text-muted">{footer}</div>}
            <div className="mt-8 border-t border-line pt-4 text-center">
              <PoweredBy />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
