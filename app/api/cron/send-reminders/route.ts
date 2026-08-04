import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"
import { venmoPayLink, eventPayNote } from "@/lib/event-pay"
import { formatEventWhen, relativeEventPhrase, eventDayKey, shiftDayKey, todayKey } from "@/lib/events/when"
import { buildEventReminderEmail } from "@/lib/events/reminder"
import { familyParentEmails } from "@/lib/events/family"
import type { SignupAttendee } from "@/lib/types"

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

  // Absolute base for links (e.g. "Change my RSVP") — from the request behind Vercel.
  const base = `${request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")}://${request.headers.get("host") ?? url.host}`

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

  // Event reminders fire per-event: each event stores how many days before it the
  // reminder should go out. "today" is the run date (overridable via ?eventToday=).
  const runDay = url.searchParams.get("eventToday") ?? todayKey()

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

  // ── Event reminders (per-event lead time) ─────────────────────────────────
  // Each event stores reminder_days_before; on the day that's that many days
  // before the event, remind everyone who RSVP'd "going". reminder_sent_at guards
  // against re-sending. Venmo pay link only for those who still owe.

  const { data: events, error: eventErr } = await supabase
    .from("events")
    .select(`
      id, title, slug, starts_at, ends_at, location, description, image_urls, pay_url, pay_instructions, status,
      reminder_days_before, reminder_note, reminder_sent_at,
      event_signups(id, name, email, parent_id, attendees, total_cents, paid, declined)
    `)
    .eq("status", "published")
    .gte("starts_at", `${runDay}T00:00:00`)

  const dueEvents = (events ?? []).filter((ev) => {
    const days = ev.reminder_days_before as number | null
    if (days == null || !ev.starts_at) return false
    if (ev.reminder_sent_at) return false // already auto-sent
    return shiftDayKey(eventDayKey(ev.starts_at as string), -days) === runDay
  })
  debug.eventsFound = events?.length ?? 0
  debug.eventsDue = dueEvents.length

  if (eventErr) {
    errors.push(`event query: ${eventErr.message}`)
  } else {
    for (const ev of dueEvents) {
      const whenStr = formatEventWhen(ev.starts_at as string | null, ev.ends_at as string | null)
      const leadPhrase = relativeEventPhrase(ev.starts_at as string | null)
      const eventUrl = `${base}/event/${ev.slug}`
      const hero = (ev.image_urls as string[] | null)?.find((u) => u?.trim()) ?? null
      let eventSent = 0

      for (const s of (ev.event_signups as any[]) ?? []) {
        if (s.declined) continue

        // One email to the whole family: contact email + co-parents' emails.
        const byEmail = new Map<string, string>()
        const add = (e: string | null | undefined) => {
          const t = (e ?? "").trim()
          if (t) byEmail.set(t.toLowerCase(), t)
        }
        add(s.email)
        if (s.parent_id) for (const e of await familyParentEmails(supabase, s.parent_id)) add(e)
        if (byEmail.size === 0) continue
        const to = [...byEmail.values()]

        const first = String(s.name ?? "there").split(" ")[0] || "there"
        const total = (s.total_cents as number) ?? 0
        const owes = !s.paid && total > 0
        const payUrl = owes
          ? venmoPayLink(ev.pay_url as string | null, eventPayNote((s.attendees ?? []) as SignupAttendee[], s.name ?? "", ev.title as string), total)
          : null

        const { subject, html, text } = buildEventReminderEmail({
          title: ev.title as string,
          firstName: first,
          leadPhrase,
          whenStr,
          location: (ev.location as string | null) ?? null,
          heroUrl: hero,
          eventUrl,
          owes,
          totalCents: total,
          payUrl,
          note: (ev.reminder_note as string | null) ?? null,
          description: (ev.description as string | null) ?? null,
          payInstructions: (ev.pay_instructions as string | null) ?? null,
          attendees: (s.attendees ?? null) as SignupAttendee[] | null,
        })

        if (dry) {
          preview.push({ to: to.join(", "), subject, body: text })
        } else {
          const { error } = await resend.emails.send({ from, to, subject, html, text })
          if (error) errors.push(`event email ${to.join(", ")}: ${error.message}`)
          else {
            emailsSent++
            eventSent++
            sentSummary.push({ to: to.join(", "), subject })
          }
        }
      }

      // Mark auto-sent so a later run today doesn't repeat it.
      if (!dry && eventSent > 0) {
        await supabase.from("events").update({ reminder_sent_at: new Date().toISOString() }).eq("id", ev.id)
      }
    }
  }

  // ── Coach summary email ───────────────────────────────────────────────────

  let summarySent = false
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
    else summarySent = true
  }

  // ── Persist log entry ─────────────────────────────────────────────────────

  const snackCount    = sentSummary.filter((e) => e.subject.startsWith("Reminder: You're bringing")).length
  const trainingCount = sentSummary.filter((e) => e.subject.startsWith("Reminder: Training")).length

  await supabase.from("cron_logs").insert({
    target_date:    targetDate,
    dry_run:        dry,
    snack_count:    snackCount,
    training_count: trainingCount,
    summary_sent:   summarySent,
    error:          errors.length ? errors.join("; ") : null,
  })

  if (dry) {
    return Response.json({ dry: true, date: targetDate, wouldSend: preview.length, preview, debug, errors: errors.length ? errors : undefined })
  }

  return Response.json({
    date: targetDate,
    emailsSent,
    errors: errors.length ? errors : undefined,
  })
}
