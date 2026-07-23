// The RSVP confirmation email, shared by the public signup (`submitSignup`) and
// the coach-side editor (`saveSignupAsCoach`) so a coach-entered signup notifies
// the family exactly like a self-signup would. Plain module (not "use server")
// so it can be imported by either route without becoming an exposed action.
//
// `to` may be several addresses (e.g. both parents of a family). Throws on send
// error so callers can swallow it — an email failure must never break the RSVP.
import { buildEmailHtml, btn, esc, infoRow } from "@/lib/email-template";
import { renderMarkdown } from "@/lib/markdown";
import type { SignupAttendee } from "@/lib/types";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// Event times are stored as UTC timestamptz with no per-event zone; format them
// in the coach's local zone so "10:00 AM" doesn't render as the UTC "5:00 PM".
// Single-tenant default (Arizona); override with EVENT_TIMEZONE if needed.
function formatWhen(startsAt?: string | null, endsAt?: string | null): string {
  if (!startsAt) return "";
  const timeZone = process.env.EVENT_TIMEZONE || "America/Phoenix";
  const start = new Date(startsAt);
  const startStr = start.toLocaleString("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  if (endsAt) {
    const endStr = new Date(endsAt).toLocaleString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
    return `${startStr} – ${endStr}`;
  }
  return startStr;
}

const sectionHeading = (t: string) =>
  `<p style="margin:22px 0 6px;font-size:12px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#9ca3af;">${esc(t)}</p>`;

const tbl = (rows: string) =>
  `<table cellpadding="0" cellspacing="0" style="margin:2px 0 8px;">${rows}</table>`;

// A row in the itemized cost breakdown (label left, amount right-aligned).
function payRow(left: string, right: string, opts?: { strong?: boolean; top?: boolean }): string {
  const base = "padding:6px 0;font-size:14px;";
  const top = opts?.top ? "border-top:2px solid #e5e7eb;padding-top:10px;" : "";
  const strong = opts?.strong ? "font-weight:700;color:#111827;" : "color:#374151;";
  return `<tr>
    <td style="${base}${top}${strong}">${left}</td>
    <td style="${base}${top}${strong}text-align:right;white-space:nowrap;">${right}</td>
  </tr>`;
}

type WhoGroup = { label: string; names: string[]; unnamed: number };
function groupWho(list: SignupAttendee[]): WhoGroup[] {
  const g: WhoGroup[] = [];
  for (const a of list) {
    let e = g.find((x) => x.label === a.tier_label);
    if (!e) {
      e = { label: a.tier_label, names: [], unnamed: 0 };
      g.push(e);
    }
    const nm = a.name?.trim();
    if (nm) e.names.push(nm);
    else e.unnamed++;
  }
  return g;
}
function whoValue(e: WhoGroup): string {
  let v = e.names.join(", ");
  if (e.unnamed > 0) v = v ? `${v} + ${e.unnamed} more` : `× ${e.unnamed}`;
  return v;
}

export type SignupConfirmationArgs = {
  to: string | string[];
  name: string;
  title: string;
  attendees: SignupAttendee[];
  total_cents: number;
  declined: boolean;
  pay_url: string | null;
  pay_instructions: string | null;
  // Richer event context (optional so older callers still compile).
  event_url?: string | null; // public signup link — lets them change their RSVP
  starts_at?: string | null;
  ends_at?: string | null;
  location?: string | null;
  description?: string | null;
  image_urls?: string[] | null;
};

// Build the confirmation email (subject/html/text) without sending — pure, so it
// can be previewed or unit-tested. `sendSignupConfirmation` wraps it + Resend.
export function buildSignupConfirmationEmail(args: SignupConfirmationArgs): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    name,
    title,
    attendees,
    total_cents,
    declined,
    pay_url,
    pay_instructions,
    event_url,
    starts_at,
    ends_at,
    location,
    description,
    image_urls,
  } = args;

  const changeBtn = event_url ? btn("Change my RSVP", event_url, "#2563eb") : "";

  // A decline gets a short "thanks for letting us know" note instead of an RSVP
  // receipt — no attendees, no payment. Still offer a way back in.
  if (declined) {
    const html = buildEmailHtml({
      teamName: title,
      htmlBody:
        `<p style="margin:0 0 14px;font-size:15px;color:#111827;">Hi ${esc(name)},</p>` +
        `<p style="margin:0 0 12px;font-size:15px;color:#111827;">Thanks for letting us know you can&rsquo;t make <strong>${esc(title)}</strong>. We&rsquo;ve marked you as not attending.</p>` +
        (changeBtn
          ? `<p style="margin:0 0 12px;font-size:15px;color:#111827;">Changed your mind?</p><div style="margin:4px 0;">${changeBtn}</div>`
          : `<p style="margin:0;font-size:13px;color:#6b7280;">Changed your mind? Just re-open the event link to update your RSVP.</p>`),
    });
    return {
      subject: `Got it — you can't make ${title}`,
      html,
      text: `Hi ${name}, thanks for letting us know you can't make ${title}. We've marked you as not attending.${event_url ? ` Changed your mind? ${event_url}` : " Re-open the event link to update your RSVP."}`,
    };
  }

  const attending = attendees.filter((a) => (a.status ?? "attending") !== "declined");
  const declinedAttendees = attendees.filter((a) => a.status === "declined");

  const sections: string[] = [];

  // Hero photo (first event image), if any.
  const hero = image_urls?.find((u) => u?.trim());
  if (hero) {
    sections.push(
      `<img src="${hero}" alt="" width="496" style="display:block;width:100%;max-width:496px;height:auto;border-radius:10px;margin:0 0 22px;" />`
    );
  }

  sections.push(`<p style="margin:0 0 14px;font-size:15px;color:#111827;">Hi ${esc(name)},</p>`);
  sections.push(
    `<p style="margin:0 0 4px;font-size:15px;color:#111827;">You&rsquo;re all set for <strong>${esc(title)}</strong>! Here are your details:</p>`
  );

  // When & where.
  const when = formatWhen(starts_at, ends_at);
  const whenWhere = (when ? infoRow("When", when) : "") + (location ? infoRow("Where", location) : "");
  if (whenWhere) sections.push(sectionHeading("When & where") + tbl(whenWhere));

  // Who's coming (grouped by tier).
  const whoRows = groupWho(attending)
    .map((e) => infoRow(e.label, whoValue(e)))
    .join("");
  const declinedRows = groupWho(declinedAttendees)
    .map((e) => infoRow(`${e.label} (not coming)`, whoValue(e)))
    .join("");
  if (whoRows || declinedRows) sections.push(sectionHeading("Who's coming") + tbl(whoRows + declinedRows));

  // Itemized cost breakdown: one line per tier + per-person price, then the
  // total. Charged and free units are split (e.g. participating vs watching
  // adults price differently), so this reconciles to the exact total.
  if (total_cents > 0) {
    const groups: { label: string; count: number; unit: number }[] = [];
    for (const a of attending) {
      const e = groups.find((x) => x.label === a.tier_label && x.unit === a.amount_cents);
      if (e) e.count++;
      else groups.push({ label: a.tier_label, count: 1, unit: a.amount_cents });
    }
    const rows = groups
      .map((g) => {
        const left =
          g.unit > 0
            ? `${esc(g.label)} <span style="color:#9ca3af;">${g.count} × ${money(g.unit)}</span>`
            : `${esc(g.label)} <span style="color:#9ca3af;">× ${g.count}</span>`;
        const right = g.unit > 0 ? money(g.unit * g.count) : `<span style="color:#9ca3af;">No charge</span>`;
        return payRow(left, right);
      })
      .join("");
    const totalRow = payRow("Total due", money(total_cents), { strong: true, top: true });
    sections.push(
      sectionHeading("What you owe") +
        `<table width="100%" cellpadding="0" cellspacing="0" style="margin:2px 0 8px;border-collapse:collapse;">${rows}${totalRow}</table>`
    );
    if (pay_instructions?.trim())
      sections.push(
        `<div style="margin:2px 0 12px;font-size:14px;color:#374151;">${renderMarkdown(pay_instructions, { inline: true })}</div>`
      );
  }

  // Actions: pay (when owed) + change RSVP.
  const buttons = [
    pay_url ? btn(`Pay now${total_cents > 0 ? ` · ${money(total_cents)}` : ""}`, pay_url, "#16a34a") : "",
    changeBtn,
  ].filter(Boolean);
  if (buttons.length) sections.push(`<div style="margin:16px 0 4px;">${buttons.join("")}</div>`);

  // Full event details (the coach's write-up), rendered at the bottom.
  if (description?.trim())
    sections.push(
      `<hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0 4px;">` +
        sectionHeading("Event info") +
        `<div style="font-size:14px;color:#374151;">${renderMarkdown(description, { inline: true })}</div>`
    );

  const html = buildEmailHtml({ teamName: title, htmlBody: sections.join("") });

  // Plain-text fallback.
  const textLines = [`Hi ${name}, you're all set for ${title}.`];
  if (when) textLines.push("", `When: ${when}`);
  if (location) textLines.push(`Where: ${location}`);
  const whoText = groupWho(attending).map((e) => `${e.label}: ${whoValue(e)}`);
  if (whoText.length) textLines.push("", "Who's coming:", ...whoText);
  if (total_cents > 0) textLines.push("", `Total due: ${money(total_cents)}`);
  if (pay_url) textLines.push("", `Pay: ${pay_url}`);
  if (event_url) textLines.push("", `Change your RSVP: ${event_url}`);

  return { subject: `You're signed up: ${title}`, html, text: textLines.join("\n") };
}

export async function sendSignupConfirmation(args: SignupConfirmationArgs): Promise<void> {
  const { subject, html, text } = buildSignupConfirmationEmail(args);
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = `${process.env.EMAIL_FROM_NAME ?? "CS Sports"} <${process.env.EMAIL_FROM ?? "onboarding@resend.dev"}>`;
  const { error } = await resend.emails.send({ from, to: args.to, subject, html, text });
  if (error) throw new Error(error.message);
}
