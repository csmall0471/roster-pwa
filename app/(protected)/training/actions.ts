"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { EligibilityRules } from "@/lib/training-eligibility"
import { notifyCoachTrainingChange, sendTrainingConfirmation } from "@/lib/notifications"

export type PaymentMethod = { label: string; link: string | null }

export type SessionData = {
  title:             string
  description:       string | null
  location:          string | null
  location_address:  string | null
  image_url:         string | null
  session_date:      string
  session_time:      string | null
  session_end_time:  string | null
  max_players:       number
  payment_amount:    string | null
  payment_methods:   PaymentMethod[]
  eligibility_rules: EligibilityRules
  notes:             string | null
  series_id:         string | null
}

export type RepeatDayConfig = {
  day:              number       // 0=Sun, 1=Mon, …, 6=Sat
  session_time:     string | null
  session_end_time: string | null
}

function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr + "T00:00:00")
  d.setDate(d.getDate() + weeks * 7)
  return d.toISOString().split("T")[0]
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00")
  d.setDate(d.getDate() + days)
  return d.toISOString().split("T")[0]
}

export async function createTrainingSession(
  data: SessionData,
  repeatWeeks = 1,
  dayConfigs: RepeatDayConfig[] = [],
) {
  const supabase = await createClient()
  const totalSessions = dayConfigs.length > 0 ? repeatWeeks * dayConfigs.length : repeatWeeks
  const seriesId = totalSessions > 1 ? crypto.randomUUID() : data.series_id

  let rows: (typeof data & { series_id: string | null })[]

  if (dayConfigs.length === 0) {
    rows = Array.from({ length: repeatWeeks }, (_, i) => ({
      ...data,
      series_id:    seriesId,
      session_date: i === 0 ? data.session_date : addWeeks(data.session_date, i),
    }))
  } else {
    const startDay = new Date(data.session_date + "T00:00:00").getDay()
    const unsorted: typeof rows = []
    for (const cfg of dayConfigs) {
      const offset = (cfg.day - startDay + 7) % 7
      for (let week = 0; week < repeatWeeks; week++) {
        unsorted.push({
          ...data,
          series_id:        seriesId,
          session_date:     addDays(data.session_date, offset + week * 7),
          session_time:     cfg.session_time,
          session_end_time: cfg.session_end_time,
        })
      }
    }
    rows = unsorted.sort((a, b) => a.session_date.localeCompare(b.session_date))
  }

  const { data: inserted, error } = await supabase
    .from("training_sessions")
    .insert(rows)
    .select("id, session_date")
  if (error) return { ids: [] as string[], seriesId: null, error: error.message }
  revalidatePath("/training")
  return { ids: (inserted ?? []).map((r) => r.id as string), seriesId, error: null }
}

export async function updateTrainingSession(id: string, data: SessionData) {
  const supabase = await createClient()
  const { error } = await supabase.from("training_sessions").update(data).eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/training")
  return { error: null }
}

export async function deleteTrainingSession(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("training_sessions").delete().eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/training")
  return { error: null }
}

export async function signUpForTraining(
  sessionId:     string,
  playerId:      string,
  paymentMethod: string | null,
  reminderEmail  = false,
  reminderSms    = false,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { signupId: null, error: "Not authenticated" }

  const { data: parentLink } = await supabase
    .from("parent_auth")
    .select("parent_id, parents(first_name, last_name, email)")
    .eq("auth_user_id", user.id)
    .maybeSingle()
  if (!parentLink) return { signupId: null, error: "Not a parent account" }

  const { data: session } = await supabase
    .from("training_sessions")
    .select("id, max_players, title, session_date, session_time, location")
    .eq("id", sessionId)
    .single()
  if (!session) return { signupId: null, error: "Session not found" }

  const { count } = await supabase
    .from("training_signups")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId)
  if ((count ?? 0) >= session.max_players) return { signupId: null, error: "Session is full" }

  const { data: row, error } = await supabase
    .from("training_signups")
    .insert({
      session_id:     sessionId,
      player_id:      playerId,
      parent_id:      parentLink.parent_id,
      payment_method: paymentMethod,
      reminder_email: reminderEmail,
      reminder_sms:   reminderSms,
    })
    .select("id")
    .single()
  if (error) return { signupId: null, error: error.message }

  const parent = parentLink.parents as any
  const { data: playerRow } = await supabase.from("players").select("first_name, last_name").eq("id", playerId).single()
  const playerName = playerRow ? `${playerRow.first_name} ${playerRow.last_name}` : "your player"
  const parentName = parent ? `${parent.first_name} ${parent.last_name}` : "A parent"

  notifyCoachTrainingChange({
    type: "signup",
    parentName,
    playerName,
    sessionTitle: session.title,
    sessionDate:  session.session_date,
  }).catch((err) => console.error("[notify] signUpForTraining coach:", err))

  if (parent?.email) {
    sendTrainingConfirmation({
      type:           "signup",
      parentEmail:    parent.email,
      parentFirstName: parent.first_name ?? "there",
      playerName,
      sessionTitle:   session.title,
      sessionDate:    session.session_date,
      sessionTime:    session.session_time,
      location:       session.location,
    }).catch((err) => console.error("[notify] signUpForTraining parent:", err))
  }

  revalidatePath("/parent/training")
  return { signupId: row.id as string, error: null }
}

export async function bulkSignUpForTraining(
  sessionIds:    string[],
  playerId:      string,
  paymentMethod: string | null,
  reminderEmail  = false,
  reminderSms    = false,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { results: [], error: "Not authenticated" }

  const { data: parentLink } = await supabase
    .from("parent_auth")
    .select("parent_id, parents(first_name, last_name, email)")
    .eq("auth_user_id", user.id)
    .maybeSingle()
  if (!parentLink) return { results: [], error: "Not a parent account" }

  const { data: playerRow } = await supabase
    .from("players")
    .select("first_name, last_name")
    .eq("id", playerId)
    .single()

  const results: Array<{ sessionId: string; signupId: string }> = []
  const signedSessions: Array<{ title: string; session_date: string; session_time: string | null; location: string | null }> = []

  for (const sessionId of sessionIds) {
    const { data: session } = await supabase
      .from("training_sessions")
      .select("max_players, title, session_date, session_time, location")
      .eq("id", sessionId)
      .single()
    if (!session) continue

    const { count } = await supabase
      .from("training_signups")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sessionId)
    if ((count ?? 0) >= session.max_players) continue

    const { data: row, error } = await supabase
      .from("training_signups")
      .insert({
        session_id:     sessionId,
        player_id:      playerId,
        parent_id:      parentLink.parent_id,
        payment_method: paymentMethod,
        reminder_email: reminderEmail,
        reminder_sms:   reminderSms,
      })
      .select("id")
      .single()
    if (!error && row) {
      results.push({ sessionId, signupId: row.id as string })
      signedSessions.push(session)
    }
  }

  if (results.length > 0) {
    const parent     = parentLink.parents as any
    const playerName = playerRow ? `${playerRow.first_name} ${playerRow.last_name}` : "your player"
    const parentName = parent ? `${parent.first_name} ${parent.last_name}` : "A parent"
    const title      = signedSessions[0].title

    notifyCoachTrainingChange({
      type:         "signup",
      parentName,
      playerName,
      sessionTitle: `${title} (${results.length} session${results.length !== 1 ? "s" : ""})`,
      sessionDate:  signedSessions[0].session_date,
    }).catch((err) => console.error("[notify] bulkSignUp coach:", err))

    if (parent?.email) {
      const appUrl      = process.env.APP_URL ?? "https://cssports-az.com"
      const sessionLines = signedSessions.map((s) => {
        const d = new Date(s.session_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
        const t = s.session_time ? (() => { const [h, m] = s.session_time!.split(":").map(Number); return ` ${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}` })() : ""
        return `  • ${d}${t}`
      }).join("\n")

      import("resend").then(({ Resend }) => {
        const resend = new Resend(process.env.RESEND_API_KEY)
        return resend.emails.send({
          from:    process.env.EMAIL_FROM ?? "onboarding@resend.dev",
          to:      parent.email,
          subject: `Registered for ${results.length} ${title} session${results.length !== 1 ? "s" : ""} — ${playerName}`,
          text:    `Hi ${parent.first_name},\n\n${playerName} is now registered for ${results.length} ${title} session${results.length !== 1 ? "s" : ""}:\n\n${sessionLines}\n\nTo cancel any session:\n${appUrl}/parent/training\n\nSee you there!\n— Coach Connor`,
        })
      }).catch((err) => console.error("[notify] bulkSignUp parent:", err))
    }
  }

  revalidatePath("/parent/training")
  return { results, error: null }
}

export async function adminAddTrainingSignup(sessionId: string, playerId: string) {
  const supabase = await createClient()

  const { data: session } = await supabase
    .from("training_sessions")
    .select("max_players")
    .eq("id", sessionId)
    .single()
  if (!session) return { signupId: null, error: "Session not found" }

  const { count } = await supabase
    .from("training_signups")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId)
  if ((count ?? 0) >= session.max_players) return { signupId: null, error: "Session is full" }

  const { data: parentRow } = await supabase
    .from("player_parents")
    .select("parent_id")
    .eq("player_id", playerId)
    .limit(1)
    .maybeSingle()

  const { data: row, error } = await supabase
    .from("training_signups")
    .insert({ session_id: sessionId, player_id: playerId, parent_id: parentRow?.parent_id ?? null })
    .select("id")
    .single()
  if (error) return { signupId: null, error: error.message }

  revalidatePath("/training")
  return { signupId: row.id as string, error: null }
}

export async function adminRemoveTrainingSignup(signupId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("training_signups").delete().eq("id", signupId)
  if (error) return { error: error.message }
  revalidatePath("/training")
  return { error: null }
}

export async function markTrainingSignupPaid(signupId: string, paid: boolean) {
  const supabase = await createClient()
  const { error } = await supabase.from("training_signups").update({ paid }).eq("id", signupId)
  if (error) return { error: error.message }
  revalidatePath("/training")
  return { error: null }
}

export async function cancelTrainingSignup(signupId: string) {
  const supabase = await createClient()

  const { data: signup } = await supabase
    .from("training_signups")
    .select(`
      parents(first_name, last_name, email),
      players(first_name, last_name),
      training_sessions(title, session_date, session_time, location)
    `)
    .eq("id", signupId)
    .single()

  const { error } = await supabase.from("training_signups").delete().eq("id", signupId)
  if (error) return { error: error.message }

  if (signup) {
    const parent     = signup.parents as any
    const player     = signup.players as any
    const session    = signup.training_sessions as any
    const playerName = player  ? `${player.first_name} ${player.last_name}`  : "your player"
    const parentName = parent  ? `${parent.first_name} ${parent.last_name}`  : "A parent"

    notifyCoachTrainingChange({
      type:         "cancel",
      parentName,
      playerName,
      sessionTitle: session?.title ?? "Training",
      sessionDate:  session?.session_date ?? "",
    }).catch((err) => console.error("[notify] cancelTrainingSignup coach:", err))

    if (parent?.email && session?.session_date) {
      sendTrainingConfirmation({
        type:            "cancel",
        parentEmail:     parent.email,
        parentFirstName: parent.first_name ?? "there",
        playerName,
        sessionTitle:    session.title,
        sessionDate:     session.session_date,
        sessionTime:     session.session_time ?? null,
        location:        session.location ?? null,
      }).catch((err) => console.error("[notify] cancelTrainingSignup parent:", err))
    }
  }

  revalidatePath("/parent/training")
  return { error: null }
}
