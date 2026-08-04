import { buildEmailHtml, btn, esc, infoRow, infoTable } from "@/lib/email-template";
import { renderMarkdown } from "@/lib/markdown";

// The event reminder email — shared by the automatic 2-day cron and the coach's
// manual "Send reminder" button so the two never drift. The caller decides the
// timing phrase (leadPhrase, e.g. "is in 2 days" / "is tomorrow") and, if the
// recipient still owes, the pay link; this just lays it out.
export type ReminderEmailArgs = {
  title: string;
  firstName: string;
  leadPhrase: string; // "is in 2 days", "is tomorrow", "is coming up", …
  whenStr: string; // from formatEventWhen()
  location: string | null;
  heroUrl: string | null;
  eventUrl: string; // "Change my RSVP" link
  owes: boolean;
  totalCents: number;
  payUrl: string | null;
  note?: string | null; // optional coach message (markdown)
};

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export function buildEventReminderEmail(a: ReminderEmailArgs): {
  subject: string;
  html: string;
  text: string;
} {
  const heroImg = a.heroUrl
    ? `<img src="${a.heroUrl}" alt="" width="496" style="display:block;width:100%;max-width:496px;height:auto;border-radius:10px;margin:0 0 22px;" />`
    : "";

  const noteBlock = a.note?.trim()
    ? `<table role="presentation" width="100%" style="margin:0 0 14px;border-collapse:collapse;"><tr><td style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 14px;font-size:14px;line-height:1.55;color:#1e3a8a;">${renderMarkdown(
        a.note,
        { inline: true }
      )}</td></tr></table>`
    : "";

  const buttons = [
    a.owes && a.payUrl ? btn(`Pay now · ${money(a.totalCents)}`, a.payUrl, "#16a34a") : "",
    btn("Change my RSVP", a.eventUrl, "#2563eb"),
  ].filter(Boolean);

  const html = buildEmailHtml({
    teamName: a.title,
    htmlBody:
      heroImg +
      `<p style="margin:0 0 14px;font-size:15px;color:#111827;">Hi ${esc(a.firstName)},</p>` +
      `<p style="margin:0 0 12px;font-size:15px;color:#111827;">Just a reminder — <strong>${esc(a.title)}</strong> ${esc(a.leadPhrase)}.</p>` +
      noteBlock +
      infoTable(infoRow("When", a.whenStr) + (a.location ? infoRow("Where", a.location) : "")) +
      (a.owes
        ? `<p style="margin:14px 0 8px;font-size:15px;color:#111827;">Our records show a balance of <strong>${money(a.totalCents)}</strong>.</p>`
        : "") +
      `<div style="margin:16px 0 4px;">${buttons.join("")}</div>` +
      `<p style="margin:14px 0 0;font-size:15px;color:#111827;">See you there!</p>`,
  });

  const text =
    `Hi ${a.firstName}, reminder: ${a.title} ${a.leadPhrase} (${a.whenStr}).` +
    (a.location ? ` Location: ${a.location}.` : "") +
    (a.note?.trim() ? `\n\n${a.note.trim()}` : "") +
    (a.owes ? `\n\nBalance due: ${money(a.totalCents)}.${a.payUrl ? ` Pay: ${a.payUrl}` : ""}` : "") +
    `\n\nChange your RSVP: ${a.eventUrl}` +
    `\n\nSee you there!\n— Coach Connor`;

  return { subject: `Reminder: ${a.title} ${a.leadPhrase}`, html, text };
}
