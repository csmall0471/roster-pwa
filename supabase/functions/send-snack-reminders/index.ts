// Supabase Edge Function: send-snack-reminders
//
// Run daily at 8 AM via pg_cron. Set up in Supabase SQL editor:
//
//   select cron.schedule(
//     'send-snack-reminders',
//     '0 8 * * *',
//     $$
//       select net.http_post(
//         url     := '<YOUR_SUPABASE_URL>/functions/v1/send-snack-reminders',
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

  // Find all signups for tomorrow's games with reminders enabled
  const { data: signups, error } = await supabase
    .from("snack_signups")
    .select(`
      id,
      reminder_email,
      reminder_sms,
      parents(first_name, last_name, email, phone),
      games!inner(
        game_date, game_time, opponent, location, is_home,
        teams!inner(name, snack_signup_enabled)
      )
    `)
    .eq("games.game_date", tomorrowStr)
    .eq("games.teams.snack_signup_enabled", true);

  if (error) {
    console.error("Error fetching signups:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  console.log(`Found ${signups?.length ?? 0} signups to remind for ${tomorrowStr}`);

  let emailsSent = 0;
  let smsSent    = 0;

  for (const signup of signups ?? []) {
    const parent = signup.parents as any;
    const game   = signup.games   as any;
    const team   = game?.teams    as any;

    const vs       = game?.opponent ? `${game.is_home ? "vs" : "@"} ${game.opponent}` : "your game";
    const dateStr  = new Date(game?.game_date + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric",
    });
    const timeStr  = game?.game_time ? ` at ${game.game_time}` : "";
    const locationLine = game?.location ? `\nLocation: ${game.location}` : "";

    // ── Email via Resend ──────────────────────────────────────────────────────
    if (signup.reminder_email && parent?.email) {
      // TODO: uncomment when RESEND_API_KEY is set
      // const res = await fetch("https://api.resend.com/emails", {
      //   method: "POST",
      //   headers: {
      //     "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      //     "Content-Type": "application/json",
      //   },
      //   body: JSON.stringify({
      //     from: Deno.env.get("EMAIL_FROM") ?? "roster@cssports-az.com",
      //     to: [parent.email],
      //     subject: `Reminder: You're bringing snacks tomorrow — ${team?.name}`,
      //     text: `Hi ${parent.first_name},\n\nReminder: you signed up to bring snacks for ${team?.name} ${vs} tomorrow (${dateStr}${timeStr}).${locationLine}\n\nThank you!\n— Coach Connor`,
      //   }),
      // });
      // if (res.ok) emailsSent++;
      console.log(`[TODO] Email reminder → ${parent.email} for ${team?.name} ${vs} on ${dateStr}`);
      emailsSent++;
    }

    // ── SMS via Twilio ────────────────────────────────────────────────────────
    if (signup.reminder_sms && parent?.phone) {
      // TODO: uncomment when Twilio keys are set
      // const body = `Reminder: You're bringing snacks for ${team?.name} ${vs} tomorrow (${dateStr}${timeStr}).${locationLine} — Coach Connor`;
      // const auth = btoa(`${Deno.env.get("TWILIO_ACCOUNT_SID")}:${Deno.env.get("TWILIO_AUTH_TOKEN")}`);
      // const res = await fetch(
      //   `https://api.twilio.com/2010-04-01/Accounts/${Deno.env.get("TWILIO_ACCOUNT_SID")}/Messages.json`,
      //   {
      //     method: "POST",
      //     headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      //     body: new URLSearchParams({ From: Deno.env.get("TWILIO_FROM_NUMBER")!, To: parent.phone, Body: body }),
      //   }
      // );
      // if (res.ok) smsSent++;
      console.log(`[TODO] SMS reminder → ${parent.phone} for ${team?.name} ${vs} on ${dateStr}`);
      smsSent++;
    }
  }

  return new Response(
    JSON.stringify({ date: tomorrowStr, signups: signups?.length ?? 0, emailsSent, smsSent }),
    { headers: { "Content-Type": "application/json" } }
  );
});
