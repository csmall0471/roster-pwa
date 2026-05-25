import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"

export const dynamic = "force-dynamic"

// Vercel calls this at 8 AM MST (15:00 UTC) daily.
// Protected by CRON_SECRET — set in Vercel env vars and locally in .env.local.
// Add ?dry=true to preview what would be sent without actually sending.

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  })
}

function fmtTime(t: string | null) {
  if (!t) return ""
  const [h, m] = t.split(":").map(Number)
  return ` at ${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
}

type PreviewEmail = {
  to: string
  subject: string
  body: string
}

export async function GET(request: Request) {
  const auth = request.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url  = new URL(request.url)
  const dry  = url.searchParams.get("dry") === "true"
  const dateOverride = url.searchParams.get("date") // e.g. ?date=2026-05-25 for testing a specific date

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const resend = new Resend(process.env.RESEND_API_KEY)
  const from   = process.env.EMAIL_FROM ?? "roster@cssports-az.com"

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const targetDate = dateOverride ?? tomorrow.toISOString().split("T")[0]

  let emailsSent = 0
  const errors: string[] = []
  const preview: PreviewEmail[] = []

  // ── Snack reminders ───────────────────────────────────────────────────────

  const { data: snackSignups, error: snackErr } = await supabase
    .from("snack_signups")
    .select(`
      reminder_email,
      parents(first_name, email),
      games!inner(
        game_date, game_time, opponent, location, is_home,
        teams!inner(name, snack_signup_enabled)
      )
    `)
    .eq("games.game_date", targetDate)
    .eq("games.teams.snack_signup_enabled", true)
    .eq("reminder_email", true)

  if (snackErr) {
    errors.push(`snack query: ${snackErr.message}`)
  } else {
    for (const signup of snackSignups ?? []) {
      const parent = signup.parents as any
      const game   = signup.games   as any
      const team   = game?.teams    as any
      if (!parent?.email) continue

      const vs      = game?.opponent ? `${game.is_home ? "vs" : "@"} ${game.opponent}` : "your game"
      const dateStr = `${fmtDate(game.game_date)}${fmtTime(game.game_time)}`
      const loc     = game?.location ? `\nLocation: ${game.location}` : ""
      const subject = `Reminder: You're bringing snacks tomorrow — ${team?.name}`
      const text    = `Hi ${parent.first_name},\n\nReminder: you signed up to bring snacks for ${team?.name} ${vs} tomorrow (${dateStr}).${loc}\n\nThank you!\n— Coach Connor`

      if (dry) {
        preview.push({ to: parent.email, subject, body: text })
      } else {
        const { error } = await resend.emails.send({ from, to: parent.email, subject, text })
        if (error) errors.push(`snack email ${parent.email}: ${error.message}`)
        else emailsSent++
      }
    }
  }

  // ── Training reminders ────────────────────────────────────────────────────

  const { data: trainingSignups, error: trainingErr } = await supabase
    .from("training_signups")
    .select(`
      reminder_email,
      parents(first_name, email),
      players(first_name, last_name),
      training_sessions!inner(title, session_date, session_time, location)
    `)
    .eq("training_sessions.session_date", targetDate)
    .eq("reminder_email", true)

  if (trainingErr) {
    errors.push(`training query: ${trainingErr.message}`)
  } else {
    for (const signup of trainingSignups ?? []) {
      const parent  = signup.parents           as any
      const player  = signup.players           as any
      const session = signup.training_sessions as any
      if (!parent?.email) continue

      const playerName = player ? `${player.first_name} ${player.last_name}` : "your player"
      const dateStr    = `${fmtDate(session.session_date)}${fmtTime(session.session_time)}`
      const loc        = session?.location ? `\nLocation: ${session.location}` : ""
      const subject    = `Reminder: Training session tomorrow — ${session.title}`
      const text       = `Hi ${parent.first_name},\n\nJust a reminder that ${playerName} is registered for ${session.title} tomorrow (${dateStr}).${loc}\n\nSee you there!\n— Coach Connor`

      if (dry) {
        preview.push({ to: parent.email, subject, body: text })
      } else {
        const { error } = await resend.emails.send({ from, to: parent.email, subject, text })
        if (error) errors.push(`training email ${parent.email}: ${error.message}`)
        else emailsSent++
      }
    }
  }

  if (dry) {
    return Response.json({ dry: true, date: targetDate, wouldSend: preview.length, preview })
  }

  return Response.json({
    date: targetDate,
    emailsSent,
    errors: errors.length ? errors : undefined,
  })
}
