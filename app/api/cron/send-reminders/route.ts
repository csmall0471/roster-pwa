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
  const from        = process.env.EMAIL_FROM ?? "roster@cssports-az.com"
  const appUrl      = process.env.APP_URL ?? "https://cssports-az.com"
  const notifyEmail = process.env.NOTIFY_EMAIL

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const targetDate = dateOverride ?? tomorrow.toISOString().split("T")[0]

  let emailsSent = 0
  const errors: string[] = []
  const preview: PreviewEmail[] = []
  const debug: Record<string, unknown> = {}
  const sentSummary: Array<{ to: string; subject: string }> = []

  // ── Snack reminders ───────────────────────────────────────────────────────
  // Query from games so we can filter game_date directly on the root table.

  const { data: snackGames, error: snackErr } = await supabase
    .from("games")
    .select(`
      id, team_id, game_date, game_time, opponent, location, is_home,
      teams!inner(name, snack_signup_enabled),
      snack_signups(
        reminder_email,
        parents(first_name, email)
      )
    `)
    .eq("game_date", targetDate)

  if (snackErr) {
    errors.push(`snack query: ${snackErr.message}`)
  } else {
    debug.snackGamesFound = snackGames?.length ?? 0
    debug.snackGames = snackGames?.map((g) => ({
      game_date: g.game_date,
      snack_signup_enabled: (g.teams as any)?.snack_signup_enabled,
      signups: (g.snack_signups as any[])?.map((s) => ({
        reminder_email: s.reminder_email,
        has_parent_email: !!(s.parents as any)?.email,
      })),
    }))
    for (const game of snackGames ?? []) {
      const team = game.teams as any
      if (!team?.snack_signup_enabled) continue

      const vs        = game.opponent ? `${game.is_home ? "vs" : "@"} ${game.opponent}` : "your game"
      const dateStr   = `${fmtDate(game.game_date)}${fmtTime(game.game_time)}`
      const loc       = game.location ? `\nLocation: ${game.location}` : ""
      const manageUrl = `${appUrl}/parent/team/${game.team_id}?tab=schedule`

      for (const signup of (game.snack_signups as any[]) ?? []) {
        if (!signup.reminder_email) continue
        const parent = signup.parents as any
        if (!parent?.email) continue

        const subject = `Reminder: You're bringing snacks tomorrow — ${team.name}`
        const text    = `Hi ${parent.first_name},\n\nReminder: you signed up to bring snacks for ${team.name} ${vs} tomorrow (${dateStr}).${loc}\n\nTo cancel or manage your signup:\n${manageUrl}\n\nThank you!\n— Coach Connor`

        if (dry) {
          preview.push({ to: parent.email, subject, body: text })
        } else {
          const { error } = await resend.emails.send({ from, to: parent.email, subject, text })
          if (error) errors.push(`snack email ${parent.email}: ${error.message}`)
          else {
            emailsSent++
            sentSummary.push({ to: parent.email, subject })
          }
        }
      }
    }
  }

  // ── Training reminders ────────────────────────────────────────────────────
  // Query from training_sessions so we can filter session_date directly.

  const { data: trainingSessions, error: trainingErr } = await supabase
    .from("training_sessions")
    .select(`
      title, session_date, session_time, location,
      training_signups(
        reminder_email,
        parents(first_name, email),
        players(first_name, last_name)
      )
    `)
    .eq("session_date", targetDate)

  debug.trainingSessionsFound = trainingSessions?.length ?? 0

  if (trainingErr) {
    errors.push(`training query: ${trainingErr.message}`)
  } else {
    for (const session of trainingSessions ?? []) {
      const dateStr   = `${fmtDate(session.session_date)}${fmtTime(session.session_time)}`
      const loc       = session.location ? `\nLocation: ${session.location}` : ""
      const manageUrl = `${appUrl}/parent/training`

      for (const signup of (session.training_signups as any[]) ?? []) {
        if (!signup.reminder_email) continue
        const parent = signup.parents as any
        const player = signup.players as any
        if (!parent?.email) continue

        const playerName = player ? `${player.first_name} ${player.last_name}` : "your player"
        const subject    = `Reminder: Training session tomorrow — ${session.title}`
        const text       = `Hi ${parent.first_name},\n\nJust a reminder that ${playerName} is registered for ${session.title} tomorrow (${dateStr}).${loc}\n\nTo cancel or manage your registration:\n${manageUrl}\n\nSee you there!\n— Coach Connor`

        if (dry) {
          preview.push({ to: parent.email, subject, body: text })
        } else {
          const { error } = await resend.emails.send({ from, to: parent.email, subject, text })
          if (error) errors.push(`training email ${parent.email}: ${error.message}`)
          else {
            emailsSent++
            sentSummary.push({ to: parent.email, subject })
          }
        }
      }
    }
  }

  // ── Coach summary email ───────────────────────────────────────────────────

  if (!dry && notifyEmail && emailsSent > 0) {
    const summaryLines = sentSummary.map((e) => `  • ${e.to} — ${e.subject}`).join("\n")
    const summaryText  = `Reminder run for ${targetDate}: ${emailsSent} email${emailsSent !== 1 ? "s" : ""} sent.\n\n${summaryLines}`
    const { error: summaryErr } = await resend.emails.send({
      from,
      to: notifyEmail,
      subject: `Roster reminders sent: ${emailsSent} email${emailsSent !== 1 ? "s" : ""} for ${targetDate}`,
      text: summaryText,
    })
    if (summaryErr) errors.push(`summary email: ${summaryErr.message}`)
  }

  if (dry) {
    return Response.json({ dry: true, date: targetDate, wouldSend: preview.length, preview, debug, errors: errors.length ? errors : undefined })
  }

  return Response.json({
    date: targetDate,
    emailsSent,
    errors: errors.length ? errors : undefined,
  })
}
