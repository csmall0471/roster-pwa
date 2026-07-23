// The RSVP confirmation email, shared by the public signup (`submitSignup`) and
// the coach-side editor (`saveSignupAsCoach`) so a coach-entered signup notifies
// the family exactly like a self-signup would. Plain module (not "use server")
// so it can be imported by either route without becoming an exposed action.
//
// `to` may be several addresses (e.g. both parents of a family). Throws on send
// error so callers can swallow it — an email failure must never break the RSVP.
import { buildEmailHtml, btn, esc, infoRow, infoTable } from "@/lib/email-template";
import { renderMarkdown } from "@/lib/markdown";
import type { SignupAttendee } from "@/lib/types";

export async function sendSignupConfirmation(args: {
  to: string | string[];
  name: string;
  title: string;
  attendees: SignupAttendee[];
  total_cents: number;
  declined: boolean;
  pay_url: string | null;
  pay_instructions: string | null;
}): Promise<void> {
  const { to, name, title, attendees, total_cents, declined, pay_url, pay_instructions } = args;

  // A decline gets a short "thanks for letting us know" note instead of an RSVP
  // receipt — no attendees, no payment.
  if (declined) {
    const html = buildEmailHtml({
      teamName: title,
      htmlBody:
        `<p style="margin:0 0 14px;font-size:15px;color:#111827;">Hi ${esc(name)},</p>` +
        `<p style="margin:0 0 12px;font-size:15px;color:#111827;">Thanks for letting us know you can&rsquo;t make <strong>${esc(title)}</strong>. We&rsquo;ve marked you as not attending.</p>` +
        `<p style="margin:0;font-size:13px;color:#6b7280;">Changed your mind? Just re-open the event link to update your RSVP.</p>`,
    });
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = `${process.env.EMAIL_FROM_NAME ?? "CS Sports"} <${process.env.EMAIL_FROM ?? "onboarding@resend.dev"}>`;
    const { error } = await resend.emails.send({
      from,
      to,
      subject: `Got it — you can't make ${title}`,
      html,
      text: `Hi ${name}, thanks for letting us know you can't make ${title}. We've marked you as not attending. Changed your mind? Re-open the event link to update your RSVP.`,
    });
    if (error) throw new Error(error.message);
    return;
  }

  const attending = attendees.filter((a) => (a.status ?? "attending") !== "declined");
  const declinedAttendees = attendees.filter((a) => a.status === "declined");

  const fmtName = (a: SignupAttendee) => a.name?.trim() || a.tier_label;
  const attendingRows = attending
    .map((a) => infoRow(a.tier_label, fmtName(a)))
    .join("");
  const declinedRows = declinedAttendees
    .map((a) => infoRow(`${a.tier_label} (not attending)`, fmtName(a)))
    .join("");

  const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const sections: string[] = [
    `<p style="margin:0 0 14px;font-size:15px;color:#111827;">Hi ${esc(name)},</p>`,
    `<p style="margin:0 0 12px;font-size:15px;color:#111827;">You're signed up for <strong>${esc(title)}</strong>. Here's your RSVP:</p>`,
  ];
  if (attendingRows || declinedRows) sections.push(infoTable(attendingRows + declinedRows));
  if (total_cents > 0)
    sections.push(
      `<p style="margin:0 0 12px;font-size:15px;color:#111827;">Total due: <strong>${money(total_cents)}</strong></p>`
    );
  if (pay_instructions?.trim())
    sections.push(
      `<div style="margin:0 0 12px;font-size:14px;color:#374151;">${renderMarkdown(pay_instructions, { inline: true })}</div>`
    );
  if (pay_url)
    sections.push(
      `<div style="margin:18px 0;">${btn(`Pay now${total_cents > 0 ? ` · ${money(total_cents)}` : ""}`, pay_url, "#16a34a")}</div>`
    );

  const html = buildEmailHtml({
    teamName: title,
    htmlBody: sections.join(""),
  });

  const textLines = [
    `Hi ${name}, you're signed up for ${title}.`,
    "",
    ...attending.map((a) => `Attending — ${a.tier_label}: ${fmtName(a)}`),
    ...declinedAttendees.map((a) => `Not attending — ${a.tier_label}: ${fmtName(a)}`),
  ];
  if (total_cents > 0) textLines.push("", `Total due: ${money(total_cents)}`);
  if (pay_url) textLines.push("", `Pay: ${pay_url}`);

  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = `${process.env.EMAIL_FROM_NAME ?? "CS Sports"} <${process.env.EMAIL_FROM ?? "onboarding@resend.dev"}>`;
  const { error } = await resend.emails.send({
    from,
    to,
    subject: `You're signed up: ${title}`,
    html,
    text: textLines.join("\n"),
  });
  if (error) throw new Error(error.message);
}
