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
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_FROM_NUMBER

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  // Find all signups for tomorrow's sessions with reminders enabled
  const { data: signups, error } = await supabase
    .from("training_signups")
    .select(`
      id,
      reminder_email,
      reminder_sms,
      parents(first_name, last_name, email, phone),
      players(first_name, last_name),
      training_sessions!inner(
        title, session_date, session_time, location
      )
    `)
    .eq("training_sessions.session_date", tomorrowStr);

  if (error) {
    console.error("Error fetching signups:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  console.log(`Found ${signups?.length ?? 0} signups to remind for ${tomorrowStr}`);

  let emailsSent = 0;
  let smsSent    = 0;

  for (const signup of signups ?? []) {
    const parent  = signup.parents   as any;
    const player  = signup.players   as any;
    const session = signup.training_sessions as any;

    const dateStr     = new Date(session?.session_date + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric",
    });
    const timeStr     = session?.session_time ? ` at ${session.session_time}` : "";
    const locationLine = session?.location ? `\nLocation: ${session.location}` : "";
    const playerName  = player ? `${player.first_name} ${player.last_name}` : "your player";

    // ── Email via Resend ──────────────────────────────────────────────────────
    if (signup.reminder_email && parent?.email) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: Deno.env.get("EMAIL_FROM") ?? "roster@cssports-az.com",
          to: [parent.email],
          subject: `Reminder: Training session tomorrow — ${session?.title}`,
          text: `Hi ${parent.first_name},\n\nJust a reminder that ${playerName} is registered for ${session?.title} tomorrow (${dateStr}${timeStr}).${locationLine}\n\nSee you there!\n— Coach Connor`,
        }),
      });
      if (res.ok) emailsSent++;
      else console.error(`Email failed for ${parent.email}:`, await res.text());
    }

    // ── SMS via Twilio ────────────────────────────────────────────────────────
    if (signup.reminder_sms && parent?.phone) {
      const body = `Reminder: ${playerName} has training tomorrow — ${session?.title} (${dateStr}${timeStr}).${locationLine} — Coach Connor`;
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
