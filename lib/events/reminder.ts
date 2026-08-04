import { buildEmailHtml, btn, esc, infoRow, sectionHeading, tbl } from "@/lib/email-template";
import { renderMarkdown } from "@/lib/markdown";

// The event reminder email — shared by the automatic cron and the coach's manual
// "Send reminder" button so the two never drift. Carries the same event
// information as the signup confirmation (when/where, photo, pay instructions,
// and the coach's full write-up) so a reminder is as complete as the receipt.
// The caller decides the timing phrase (leadPhrase) and, if the recipient still
// owes, the pay link.
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
  note?: string | null; // optional coach message
  description?: string | null; // the event's full write-up (markdown)
  payInstructions?: string | null; // how/where to pay (markdown)
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

  const whenWhere = (a.whenStr ? infoRow("When", a.whenStr) : "") + (a.location ? infoRow("Where", a.location) : "");

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
      (whenWhere ? sectionHeading("When & where") + tbl(whenWhere) : "") +
      (a.owes
        ? `<p style="margin:14px 0 4px;font-size:15px;color:#111827;">Our records show a balance of <strong>${money(a.totalCents)}</strong>.</p>` +
          (a.payInstructions?.trim()
            ? `<div style="margin:2px 0 8px;font-size:14px;color:#374151;">${renderMarkdown(a.payInstructions, { inline: true })}</div>`
            : "")
        : "") +
      `<div style="margin:16px 0 4px;">${buttons.join("")}</div>` +
      `<p style="margin:14px 0 0;font-size:15px;color:#111827;">See you there!</p>` +
      (a.description?.trim()
        ? `<hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0 4px;">` +
          sectionHeading("Event info") +
          `<div style="font-size:14px;color:#374151;">${renderMarkdown(a.description, { inline: true })}</div>`
        : ""),
  });

  const text =
    `Hi ${a.firstName}, reminder: ${a.title} ${a.leadPhrase} (${a.whenStr}).` +
    (a.location ? ` Location: ${a.location}.` : "") +
    (a.note?.trim() ? `\n\n${a.note.trim()}` : "") +
    (a.owes
      ? `\n\nBalance due: ${money(a.totalCents)}.${a.payUrl ? ` Pay: ${a.payUrl}` : ""}${
          a.payInstructions?.trim() ? `\n${a.payInstructions.trim()}` : ""
        }`
      : "") +
    `\n\nChange your RSVP: ${a.eventUrl}` +
    (a.description?.trim() ? `\n\n${a.description.trim()}` : "") +
    `\n\nSee you there!\n— Coach Connor`;

  return { subject: `Reminder: ${a.title} ${a.leadPhrase}`, html, text };
}
