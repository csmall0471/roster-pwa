import { buildEmailHtml, btn, esc, infoRow, sectionHeading, tbl } from "@/lib/email-template";
import { renderMarkdown } from "@/lib/markdown";
import { whosComingSection, costBreakdownSection, groupWhoText } from "@/lib/events/email-sections";
import type { SignupAttendee } from "@/lib/types";

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
  attendees?: SignupAttendee[] | null; // this family's RSVP → who's coming + cost breakdown
  greetingNames?: string[] | null; // all parents to greet ("Sara and Brandon"); falls back to firstName
};

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

// "Sara" · "Sara and Brandon" · "Sara, Brandon, and Alex"
function formatNames(names: string[]): string {
  const n = names.filter((x) => x.trim());
  if (n.length === 0) return "there";
  if (n.length === 1) return n[0];
  if (n.length === 2) return `${n[0]} and ${n[1]}`;
  return `${n.slice(0, -1).join(", ")}, and ${n[n.length - 1]}`;
}

export function buildEventReminderEmail(a: ReminderEmailArgs): {
  subject: string;
  html: string;
  text: string;
} {
  const greeting = a.greetingNames && a.greetingNames.length ? formatNames(a.greetingNames) : a.firstName;

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

  const attendees = a.attendees ?? [];
  const whoSection = attendees.length ? whosComingSection(attendees) : "";

  // Cost breakdown shows whenever there's a charge — labeled "owe" when unpaid
  // (with pay instructions), or "paid" with a thank-you when settled. total > 0
  // and not owing means paid.
  const hasCost = attendees.length > 0 && a.totalCents > 0;
  const paid = hasCost && !a.owes;
  const payInstrDiv = a.payInstructions?.trim()
    ? `<div style="margin:2px 0 8px;font-size:14px;color:#374151;">${renderMarkdown(a.payInstructions, { inline: true })}</div>`
    : "";

  let costBlock = "";
  if (hasCost) {
    costBlock = a.owes
      ? costBreakdownSection(attendees, a.totalCents) + payInstrDiv
      : costBreakdownSection(attendees, a.totalCents, { heading: "What you paid", totalLabel: "Total paid" }) +
        `<p style="margin:6px 0 0;font-size:14px;font-weight:600;color:#16a34a;">✓ Paid — thank you!</p>`;
  } else if (a.owes) {
    // Owed, but no itemized attendee detail (e.g. a generic preview).
    costBlock =
      `<p style="margin:14px 0 4px;font-size:15px;color:#111827;">Our records show a balance of <strong>${money(a.totalCents)}</strong>.</p>` +
      payInstrDiv;
  }

  const buttons = [
    a.owes && a.payUrl ? btn(`Pay now · ${money(a.totalCents)}`, a.payUrl, "#16a34a") : "",
    btn("Change my RSVP", a.eventUrl, "#2563eb"),
  ].filter(Boolean);

  // How to pay (only when there's a balance): Venmo via the button, or Zelle / cash.
  const payNote = a.owes
    ? `<p style="margin:12px 0 4px;font-size:14px;color:#374151;">${
        a.payUrl ? "Pay with the <strong>Pay now</strong> button below (Venmo), or by " : "You can pay by "
      }<strong>Zelle</strong> or <strong>cash</strong>.</p>`
    : "";
  const payNoteText = a.owes
    ? `\n\n${a.payUrl ? "Pay with the Venmo link above, or by" : "You can pay by"} Zelle or cash.`
    : "";

  const html = buildEmailHtml({
    teamName: a.title,
    htmlBody:
      heroImg +
      `<p style="margin:0 0 14px;font-size:15px;color:#111827;">Hi ${esc(greeting)},</p>` +
      `<p style="margin:0 0 12px;font-size:15px;color:#111827;">Just a reminder — <strong>${esc(a.title)}</strong> ${esc(a.leadPhrase)}.</p>` +
      noteBlock +
      (whenWhere ? sectionHeading("When & where") + tbl(whenWhere) : "") +
      whoSection +
      costBlock +
      payNote +
      `<div style="margin:16px 0 4px;">${buttons.join("")}</div>` +
      `<p style="margin:14px 0 0;font-size:15px;color:#111827;">See you there!</p>` +
      (a.description?.trim()
        ? `<hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0 4px;">` +
          sectionHeading("Event info") +
          `<div style="font-size:14px;color:#374151;">${renderMarkdown(a.description, { inline: true })}</div>`
        : ""),
  });

  const whoText = attendees.length ? groupWhoText(attendees) : [];
  const text =
    `Hi ${greeting}, reminder: ${a.title} ${a.leadPhrase} (${a.whenStr}).` +
    (a.location ? ` Location: ${a.location}.` : "") +
    (a.note?.trim() ? `\n\n${a.note.trim()}` : "") +
    (whoText.length ? `\n\nWho's coming:\n${whoText.join("\n")}` : "") +
    (a.owes
      ? `\n\nBalance due: ${money(a.totalCents)}.${a.payUrl ? ` Pay: ${a.payUrl}` : ""}${
          a.payInstructions?.trim() ? `\n${a.payInstructions.trim()}` : ""
        }`
      : paid
        ? `\n\nTotal paid: ${money(a.totalCents)} — thank you!`
        : "") +
    payNoteText +
    `\n\nChange your RSVP: ${a.eventUrl}` +
    (a.description?.trim() ? `\n\n${a.description.trim()}` : "") +
    `\n\nSee you there!\n— Coach Connor`;

  return { subject: `Reminder: ${a.title} ${a.leadPhrase}`, html, text };
}
