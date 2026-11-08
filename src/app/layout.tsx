import type { Metadata, Viewport } from "next";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";
import { SITE } from "@/lib/constants";

export const metadata: Metadata = {
  title: { default: `${SITE.name} | ${SITE.group}`, template: `%s | ${SITE.name}` },
  description: `${SITE.name}: attendance, sessional marks and NOC management system for ${SITE.group}.`,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0b1f4a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
