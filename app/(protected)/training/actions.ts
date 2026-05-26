"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { EligibilityRules } from "@/lib/training-eligibility"
import { sendTrainingConfirmation } from "@/lib/notifications"
import { logActivity } from "@/lib/activity"

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

export async function deleteTrainingSeries(seriesId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("training_sessions").delete().eq("series_id", seriesId)
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
    .select("id, max_players, title, description, notes, image_url, session_date, session_time, session_end_time, location, payment_amount, payment_methods")
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
  logActivity(parentLink.parent_id, "training_signup", { session_id: sessionId, session_title: session.title, session_date: session.session_date, player_id: playerId }).catch(() => {})
  const { data: playerRow } = await supabase.from("players").select("first_name, last_name").eq("id", playerId).single()
  const playerName = playerRow ? `${playerRow.first_name} ${playerRow.last_name}` : "your player"

  if (parent?.email) {
    sendTrainingConfirmation({
      type:            "signup",
      parentEmail:     parent.email,
      parentFirstName: parent.first_name ?? "there",
      playerName,
      sessionTitle:    session.title,
      sessionDate:     session.session_date,
      sessionTime:     session.session_time,
      sessionEndTime:  (session as any).session_end_time ?? null,
      location:        session.location,
      paymentAmount:   (session as any).payment_amount ?? null,
      paymentMethods:  (session as any).payment_methods ?? [],
      imageUrl:        (session as any).image_url ?? null,
      description:     (session as any).description ?? null,
      notes:           (session as any).notes ?? null,
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
  const signedSessions: Array<{
    title: string; session_date: string; session_time: string | null
    session_end_time: string | null; location: string | null
    payment_amount: string | null; payment_methods: PaymentMethod[]
    image_url: string | null; description: string | null; notes: string | null
  }> = []

  for (const sessionId of sessionIds) {
    const { data: session } = await supabase
      .from("training_sessions")
      .select("max_players, title, description, notes, image_url, session_date, session_time, session_end_time, location, payment_amount, payment_methods")
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
      signedSessions.push({
        title:            session.title,
        session_date:     session.session_date,
        session_time:     session.session_time,
        session_end_time: (session as any).session_end_time ?? null,
        location:         session.location,
        payment_amount:   (session as any).payment_amount ?? null,
        payment_methods:  (session as any).payment_methods ?? [],
        image_url:        (session as any).image_url ?? null,
        description:      (session as any).description ?? null,
        notes:            (session as any).notes ?? null,
      })
    }
  }

  if (results.length > 0) {
    const parent     = parentLink.parents as any
    const playerName = playerRow ? `${playerRow.first_name} ${playerRow.last_name}` : "your player"
    const first      = signedSessions[0]

    if (parent?.email) {
      sendTrainingConfirmation({
        type:            "signup",
        parentEmail:     parent.email,
        parentFirstName: parent.first_name ?? "there",
        playerName,
        sessionTitle:    first.title,
        sessionDate:     first.session_date,
        sessionTime:     first.session_time,
        sessionEndTime:  first.session_end_time,
        location:        first.location,
        paymentAmount:   first.payment_amount,
        paymentMethods:  first.payment_methods,
        imageUrl:        first.image_url,
        description:     first.description,
        notes:           first.notes,
        bulkDates: signedSessions.map(s => ({
          date:    s.session_date,
          time:    s.session_time,
          endTime: s.session_end_time,
        })),
      }).catch((err) => console.error("[notify] bulkSignUp parent:", err))
    }
  }

  if (results.length > 0) {
    logActivity(parentLink.parent_id, "training_signup", { session_ids: results.map((r) => r.sessionId), count: results.length, player_id: playerId, bulk: true }).catch(() => {})
  }

  revalidatePath("/parent/training")
  return { results, error: null }
}

export async function adminAddTrainingSignup(sessionId: string, playerId: string) {
  const supabase = await createClient()

  const { data: session } = await supabase
    .from("training_sessions")
    .select("max_players, title, description, notes, image_url, session_date, session_time, session_end_time, location, payment_amount, payment_methods")
    .eq("id", sessionId)
    .single()
  if (!session) return { signupId: null, error: "Session not found" }

  const { count } = await supabase
    .from("training_signups")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId)
  if ((count ?? 0) >= session.max_players) return { signupId: null, error: "Session is full" }

  const [{ data: parentRow }, { data: playerRow }] = await Promise.all([
    supabase.from("player_parents").select("parent_id, parents(first_name, last_name, email)").eq("player_id", playerId).limit(1).maybeSingle(),
    supabase.from("players").select("first_name, last_name").eq("id", playerId).single(),
  ])

  const { data: row, error } = await supabase
    .from("training_signups")
    .insert({ session_id: sessionId, player_id: playerId, parent_id: parentRow?.parent_id ?? null, reminder_email: true })
    .select("id")
    .single()
  if (error) return { signupId: null, error: error.message }

  const parent = (parentRow as any)?.parents
  const playerName = playerRow ? `${playerRow.first_name} ${playerRow.last_name}` : "your player"
  if (parent?.email) {
    sendTrainingConfirmation({
      type:            "signup",
      parentEmail:     parent.email,
      parentFirstName: parent.first_name ?? "there",
      playerName,
      sessionTitle:    session.title,
      sessionDate:     session.session_date,
      sessionTime:     (session as any).session_time ?? null,
      sessionEndTime:  (session as any).session_end_time ?? null,
      location:        session.location ?? null,
      paymentAmount:   (session as any).payment_amount ?? null,
      paymentMethods:  (session as any).payment_methods ?? [],
      imageUrl:        (session as any).image_url ?? null,
      description:     (session as any).description ?? null,
      notes:           (session as any).notes ?? null,
    }).catch((err) => console.error("[notify] adminAddTrainingSignup parent:", err))
  }

  if (parentRow?.parent_id) {
    logActivity(parentRow.parent_id, "training_signup", { session_id: sessionId, session_title: session.title, session_date: session.session_date, player_id: playerId, by_admin: true }).catch(() => {})
  }

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

export type BulkSessionUpdateData = Omit<SessionData, "session_date" | "series_id">

export async function adminBulkUpdateSessions(sessionIds: string[], data: BulkSessionUpdateData) {
  const supabase = await createClient()
  const { error } = await supabase.from("training_sessions").update(data).in("id", sessionIds)
  if (error) return { error: error.message }
  revalidatePath("/training")
  return { error: null }
}

export async function adminBulkAddPlayerToSessions(sessionIds: string[], playerId: string) {
  const supabase = await createClient()

  const [{ data: parentRow }, { data: playerRow }] = await Promise.all([
    supabase.from("player_parents").select("parent_id, parents(first_name, last_name, email)").eq("player_id", playerId).limit(1).maybeSingle(),
    supabase.from("players").select("first_name, last_name").eq("id", playerId).single(),
  ])

  const parentId = parentRow?.parent_id ?? null

  const [{ data: sessions }, { data: existingSignups }] = await Promise.all([
    supabase.from("training_sessions").select("id, max_players, title, description, notes, image_url, session_date, session_time, session_end_time, location, payment_amount, payment_methods").in("id", sessionIds),
    supabase.from("training_signups").select("session_id, player_id").in("session_id", sessionIds),
  ])

  const countBySession = new Map<string, number>()
  const alreadyIn = new Set<string>()
  for (const su of existingSignups ?? []) {
    countBySession.set(su.session_id, (countBySession.get(su.session_id) ?? 0) + 1)
    if (su.player_id === playerId) alreadyIn.add(su.session_id)
  }

  const added: Array<{ sessionId: string; signupId: string }> = []
  const signedSessions: typeof sessions = []
  for (const session of sessions ?? []) {
    if (alreadyIn.has(session.id)) continue
    if ((countBySession.get(session.id) ?? 0) >= session.max_players) continue
    const { data: row, error } = await supabase
      .from("training_signups")
      .insert({ session_id: session.id, player_id: playerId, parent_id: parentId, reminder_email: true })
      .select("id")
      .single()
    if (!error && row) {
      added.push({ sessionId: session.id, signupId: row.id as string })
      signedSessions?.push(session)
    }
  }

  if (added.length > 0) {
    const parent = (parentRow as any)?.parents
    const playerName = playerRow ? `${playerRow.first_name} ${playerRow.last_name}` : "your player"
    const first = signedSessions![0]
    if (parent?.email && first) {
      sendTrainingConfirmation({
        type:            "signup",
        parentEmail:     parent.email,
        parentFirstName: parent.first_name ?? "there",
        playerName,
        sessionTitle:    first.title,
        sessionDate:     first.session_date,
        sessionTime:     (first as any).session_time ?? null,
        sessionEndTime:  (first as any).session_end_time ?? null,
        location:        (first as any).location ?? null,
        paymentAmount:   (first as any).payment_amount ?? null,
        paymentMethods:  (first as any).payment_methods ?? [],
        imageUrl:        (first as any).image_url ?? null,
        description:     (first as any).description ?? null,
        notes:           (first as any).notes ?? null,
        bulkDates:       signedSessions!.map((s) => ({
          date:    s.session_date,
          time:    (s as any).session_time ?? null,
          endTime: (s as any).session_end_time ?? null,
        })),
      }).catch((err) => console.error("[notify] adminBulkAddPlayerToSessions parent:", err))
    }
    if (parentId) {
      logActivity(parentId, "training_signup", { session_ids: added.map((r) => r.sessionId), count: added.length, player_id: playerId, bulk: true, by_admin: true }).catch(() => {})
    }
  }

  revalidatePath("/training")
  return { added, error: null }
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
      paid, parent_id,
      parents(first_name, last_name, email),
      players(first_name, last_name),
      training_sessions(title, session_date, session_time, session_end_time, location)
    `)
    .eq("id", signupId)
    .single()

  const { error } = await supabase.from("training_signups").delete().eq("id", signupId)
  if (error) return { error: error.message }

  if (signup) {
    const parent     = signup.parents as any
    const player     = signup.players as any
    const session    = signup.training_sessions as any
    if ((signup as any).parent_id && session) {
      logActivity((signup as any).parent_id, "training_cancel", { session_title: session.title, session_date: session.session_date }).catch(() => {})
    }
    const playerName = player  ? `${player.first_name} ${player.last_name}`  : "your player"
    const parentName = parent  ? `${parent.first_name} ${parent.last_name}`  : "A parent"

    if (parent?.email && session?.session_date) {
      sendTrainingConfirmation({
        type:            "cancel",
        parentEmail:     parent.email,
        parentFirstName: parent.first_name ?? "there",
        playerName,
        sessionTitle:    session.title,
        sessionDate:     session.session_date,
        sessionTime:     session.session_time ?? null,
        sessionEndTime:  session.session_end_time ?? null,
        location:        session.location ?? null,
        hasPaid:         (signup as any).paid ?? false,
      }).catch((err) => console.error("[notify] cancelTrainingSignup parent:", err))
    }
  }

  revalidatePath("/parent/training")
  return { error: null }
}

export async function cancelMultipleTrainingSignups(signupIds: string[]) {
  if (signupIds.length === 0) return { error: null }
  const supabase = await createClient()

  const { data: signups } = await supabase
    .from("training_signups")
    .select(`
      id, paid,
      parents(first_name, last_name, email),
      players(first_name, last_name),
      training_sessions(title, session_date, session_time, session_end_time, location)
    `)
    .in("id", signupIds)

  const { error } = await supabase.from("training_signups").delete().in("id", signupIds)
  if (error) return { error: error.message }

  if (signups && signups.length > 0) {
    const first   = signups[0]
    const parent  = first.parents as any
    const player  = first.players as any
    const session = first.training_sessions as any
    const playerName = player ? `${player.first_name} ${player.last_name}` : "your player"
    const hasPaid = signups.some((s) => (s as any).paid)

    if (parent?.email && session) {
      const bulkDates = signups
        .map((s) => {
          const sess = s.training_sessions as any
          return sess ? { date: sess.session_date as string, time: (sess.session_time ?? null) as string | null, endTime: (sess.session_end_time ?? null) as string | null } : null
        })
        .filter(Boolean)
        .sort((a, b) => a!.date.localeCompare(b!.date)) as Array<{ date: string; time: string | null; endTime: string | null }>

      sendTrainingConfirmation({
        type:            "cancel",
        parentEmail:     parent.email,
        parentFirstName: parent.first_name ?? "there",
        playerName,
        sessionTitle:    session.title,
        sessionDate:     bulkDates[0]?.date ?? session.session_date,
        sessionTime:     bulkDates[0]?.time ?? session.session_time ?? null,
        sessionEndTime:  bulkDates[0]?.endTime ?? null,
        location:        session.location ?? null,
        hasPaid,
        bulkDates:       bulkDates.length > 1 ? bulkDates : undefined,
      }).catch((err) => console.error("[notify] cancelMultiple parent:", err))
    }
  }

  revalidatePath("/parent/training")
  return { error: null }
}
