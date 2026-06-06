// Supabase Edge Function: send-training-reminders
//
// Run daily at 8 AM via pg_cron. Set up in Supabase SQL editor:
//
//   select cron.schedule(
//     'send-training-reminders',
//     '0 8 * * *',
//     $$
//       select net.http_post(
//         url     := '<YOUR_SUPABASE_URL>/functions/v1/send-training-reminders',
//         headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
//         body    := '{}'::jsonb
//       );
//     $$
//   );
//
// Required env vars (set in Supabase Dashboard → Edge Functions → Secrets):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   RESEND_API_KEY
//   EMAIL_FROM          (e.g. roster@cssports-az.com)
//   APP_URL             (e.g. https://cssports-az.com)
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_FROM_NUMBER

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Email HTML helpers ────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function btn(label: string, url: string, color = "#ea580c"): string {
  return `<a href="${url}" style="display:inline-block;padding:11px 22px;background:${color};color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;border-radius:8px;margin:4px 4px 4px 0;">${esc(label)}</a>`;
}

function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:5px 16px 5px 0;font-size:14px;color:#6b7280;white-space:nowrap;font-weight:500;vertical-align:top;">${esc(label)}</td>
    <td style="padding:5px 0;font-size:14px;color:#111827;vertical-align:top;">${esc(value)}</td>
  </tr>`;
}

function locationMapRow(location: string): string {
  const encoded = encodeURIComponent(location);
  const appleUrl = `https://maps.apple.com/?q=${encoded}`;
  const googleUrl = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
  return `<tr>
    <td style="padding:5px 16px 5px 0;font-size:14px;color:#6b7280;white-space:nowrap;font-weight:500;vertical-align:top;">Location</td>
    <td style="padding:5px 0;font-size:14px;color:#111827;vertical-align:top;">${esc(location)}<br><span style="font-size:12px;"><a href="${appleUrl}" style="color:#2563eb;text-decoration:none;">Apple Maps →</a>&nbsp;&nbsp;<a href="${googleUrl}" style="color:#2563eb;text-decoration:none;">Google Maps →</a></span></td>
  </tr>`;
}

function infoTable(rows: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:20px 0 24px;">${rows}</table>`;
}

function divider(): string {
  return `<hr style="border:none;border-top:1px solid #f3f4f6;margin:22px 0;">`;
}

function buildHtml(htmlBody: string, title: string, subtitle: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;">
        <tr>
          <td style="background:#ea580c;padding:24px 32px;border-radius:12px 12px 0 0;">
            <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">${esc(title)}</p>
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">${esc(subtitle)}</p>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;padding:32px;">${htmlBody}</td>
        </tr>
        <tr>
          <td style="background:#ffffff;padding:0 32px 28px;border-radius:0 0 12px 12px;border-top:1px solid #f3f4f6;">
            <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
              — Connor Small, Coach<br>
              <a href="mailto:csmall0471@gmail.com" style="color:#6b7280;text-decoration:none;">csmall0471@gmail.com</a>
            </p>
            <p style="margin:12px 0 0;font-size:11px;color:#9ca3af;line-height:1.6;">
              You received this because you are registered with a team coached by Connor Small.<br>
              Reply <strong>STOP</strong> to opt out.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Time formatting ───────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

function fmtTime12(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function fmtTimeRange(start: string | null, end: string | null): string {
  if (!start) return "";
  if (!end) return ` at ${fmtTime12(start)}`;
  return ` at ${fmtTime12(start)} – ${fmtTime12(end)}`;
}

// ── Edge function ─────────────────────────────────────────────────────────────

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  const { data: signups, error } = await supabase
    .from("training_signups")
    .select(`
      id,
      reminder_email,
      reminder_sms,
      parents(first_name, last_name, email, phone),
      players(first_name, last_name),
      training_sessions!inner(
        title, session_date, session_time, session_end_time,
        location, image_url, notes
      )
    `)
    .eq("training_sessions.session_date", tomorrowStr);

  if (error) {
    console.error("Error fetching signups:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  console.log(`Found ${signups?.length ?? 0} signups to remind for ${tomorrowStr}`);

  const appUrl    = Deno.env.get("APP_URL") ?? "https://cssports-az.com";
  const manageUrl = `${appUrl}/parent/training`;
  let emailsSent = 0;
  let smsSent    = 0;

  for (const signup of signups ?? []) {
    const parent  = signup.parents   as any;
    const player  = signup.players   as any;
    const session = signup.training_sessions as any;

    const playerName  = player ? `${player.first_name} ${player.last_name}` : "your player";
    const timeRange   = fmtTimeRange(session?.session_time ?? null, session?.session_end_time ?? null);
    const dateStr     = fmtDate(session?.session_date) + timeRange;
    const locationLine = session?.location ? `\nLocation: ${session.location}` : "";

    // ── Email ─────────────────────────────────────────────────────────────
    if (signup.reminder_email && parent?.email) {
      const text = `Hi ${parent.first_name},\n\nJust a reminder that ${playerName} is registered for ${session?.title} tomorrow (${dateStr}).${locationLine}\n\nTo cancel:\n${manageUrl}\n\nSee you there!\n— Coach Connor`;

      // HTML
      const timeDisplay = timeRange.replace(" at ", "").trim();
      const rows = [
        infoRow("Date", fmtDate(session?.session_date)),
        session?.session_time ? infoRow("Time", timeDisplay) : "",
        session?.location ? locationMapRow(session.location) : "",
      ].filter(Boolean).join("\n");

      const imageUrl = session?.image_url ?? null;
      const notes    = session?.notes ?? null;

      const htmlBody = [
        `<p style="margin:0 0 4px;font-size:15px;line-height:1.75;color:#374151;">Hi ${esc(parent.first_name)},</p>`,
        `<p style="margin:0 0 20px;font-size:15px;line-height:1.75;color:#374151;"><strong>${esc(playerName)}</strong> has training tomorrow — <strong>${esc(session?.title ?? "")}</strong>!</p>`,
        infoTable(rows),
        imageUrl ? `<img src="${imageUrl}" alt="" style="width:100%;height:192px;object-fit:cover;border-radius:8px;margin:16px 0;">` : "",
        notes ? `<p style="margin:0 0 20px;font-size:13px;color:#6b7280;font-style:italic;">${esc(notes)}</p>` : "",
        divider(),
        `<p style="margin:0 0 12px;font-size:13px;color:#6b7280;">Need to cancel?</p>`,
        btn("Cancel Registration", manageUrl, "#6b7280"),
      ].filter(Boolean).join("\n");

      const fromName  = Deno.env.get("EMAIL_FROM_NAME") ?? "CS Sports";
      const fromEmail = Deno.env.get("EMAIL_FROM") ?? "roster@cssports-az.com";
      const from      = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to:      [parent.email],
          ...(Deno.env.get("NOTIFY_EMAIL") ? { bcc: [Deno.env.get("NOTIFY_EMAIL")] } : {}),
          subject: `Reminder: Training session tomorrow — ${session?.title}`,
          text,
          html:    buildHtml(htmlBody, session?.title ?? "CS Sports Training", "Training Reminder"),
        }),
      });
      if (res.ok) emailsSent++;
      else console.error(`Email failed for ${parent.email}:`, await res.text());
    }

    // ── SMS ───────────────────────────────────────────────────────────────
    if (signup.reminder_sms && parent?.phone) {
      const body = `Reminder: ${playerName} has training tomorrow — ${session?.title} (${dateStr}).${locationLine} — Coach Connor`;
      const auth = btoa(`${Deno.env.get("TWILIO_ACCOUNT_SID")}:${Deno.env.get("TWILIO_AUTH_TOKEN")}`);
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${Deno.env.get("TWILIO_ACCOUNT_SID")}/Messages.json`,
        {
          method: "POST",
          headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ From: Deno.env.get("TWILIO_FROM_NUMBER")!, To: parent.phone, Body: body }),
        }
      );
      if (res.ok) smsSent++;
      else console.error(`SMS failed for ${parent.phone}:`, await res.text());
    }
  }

  return new Response(
    JSON.stringify({ date: tomorrowStr, signups: signups?.length ?? 0, emailsSent, smsSent }),
    { headers: { "Content-Type": "application/json" } }
  );
});
