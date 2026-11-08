import "server-only";
import { env } from "@/lib/env";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Email via Resend. If RESEND_API_KEY is missing, skip silently (the in-app notification is still sent). */
export async function sendEmail(to: string, subject: string, message: string, link?: string): Promise<void> {
  if (!env.resendKey) return;
  const url = link ? `${env.siteUrl}${link}` : env.siteUrl;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #e4e0d8;border-radius:8px;overflow:hidden">
    <div style="background:#0b1f4a;color:#fff;padding:14px 20px;font-weight:700">United Group of Institutions &middot; Campus ERP</div>
    <div style="padding:20px;color:#1b1b1f;line-height:1.55"><h2 style="margin:0 0 10px;font-size:18px">${esc(subject)}</h2>
    <p style="margin:0 0 18px">${esc(message)}</p>
    <a href="${url}" style="background:#8f1d21;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block">Open Campus ERP</a></div>
    <div style="padding:10px 20px;background:#f6f3ee;color:#666;font-size:12px">Powered by yatsu</div></div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.emailFrom, to: [to], subject, html }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error("[email] resend", res.status, await res.text());
  } catch (e) {
    console.error("[email] failed", e);
  }
}
