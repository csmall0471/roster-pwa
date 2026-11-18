"use server"

import { revalidatePath } from "next/cache"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import type { EligibilityRules } from "@/lib/training-eligibility"
import { sendTrainingConfirmation } from "@/lib/notifications"
import { logActivity } from "@/lib/activity"
import { track } from "@vercel/analytics/server"
import { isMissingPackageColumn, PACKAGE_MIGRATION_MSG, isMissingAttendingColumn, ATTENDANCE_MIGRATION_MSG, isMissingSiblingColumn, SIBLING_MIGRATION_MSG, packageKidPrice, isSiblingPrice } from "@/lib/training-package"

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
  /** Parents sign up for every date in the series at once (no single dates). */
  package_only:      boolean
  /** Price for the whole series when package_only (e.g. "$75"). */
  package_price:     string | null
  /** What each extra kid from one family pays: "50%" (off) or "$50"; null = full price. */
  package_sibling_price: string | null
}

type PackageCols = { package_only?: boolean; package_price?: string | null; package_sibling_price?: string | null }

// The package columns only exist once migration 071 is applied. A session that
// isn't a package leaves them out, so creating/editing ordinary sessions keeps
// working before then (the columns' defaults are the same values).
function withoutPackage<T extends PackageCols>(row: T) {
  if (row.package_only) return row
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { package_only, package_price, package_sibling_price, ...rest } = row
  return rest
}

// Sibling pricing (migration 073) is newer still: a write with no sibling price
// that fails only because the column is missing is retried without it.
function withoutSibling<T extends object>(row: T): Omit<T, "package_sibling_price"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { package_sibling_price, ...rest } = row as T & { package_sibling_price?: unknown }
  return rest
}

function retrySansSibling(error: { message: string } | null, row: PackageCols): boolean {
  return !!error && !row.package_sibling_price && isMissingSiblingColumn(error.message)
}

function writeErrorMessage(message: string): string {
  if (isMissingSiblingColumn(message)) return SIBLING_MIGRATION_MSG
  if (isMissingPackageColumn(message)) return PACKAGE_MIGRATION_MSG
  return message
}

export type RepeatDayConfig = {
  day:              number       // 0=Sun, 1=Mon, …, 6=Sat
  session_time:     string | null
  session_end_time: string | null
}

function calcBulkAmount(perSession: string | null, count: number): string | null {
  if (!perSession || count <= 1) return perSession ?? null
  const num = parseFloat(perSession.replace(/[^0-9.]/g, ""))
  if (!num) return perSession
  const total = num * count
  return Number.isInteger(total) ? String(total) : total.toFixed(2)
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

/** One hand-picked date of a series, with its own times. */
export type SpecificDate = {
  date:             string
  session_time:     string | null
  session_end_time: string | null
}

export async function createTrainingSession(
  data: SessionData,
  repeatWeeks = 1,
  dayConfigs: RepeatDayConfig[] = [],
  // Hand-picked dates (any days, not a weekly pattern). When given, they
  // replace data.session_date / repeatWeeks / dayConfigs.
  specificDates: SpecificDate[] = [],
) {
  const supabase = await createClient()
  const picked = [...new Map(specificDates.filter((d) => d.date).map((d) => [d.date, d])).values()]
    .sort((a, b) => a.date.localeCompare(b.date))
  const totalSessions = picked.length > 0
    ? picked.length
    : dayConfigs.length > 0 ? repeatWeeks * dayConfigs.length : repeatWeeks
  // Weekly: always a new series. Picked dates: added to the series the coach
  // chose, else a new one when there's more than one date.
  const seriesId = picked.length > 0
    ? data.series_id || (totalSessions > 1 ? crypto.randomUUID() : null)
    : totalSessions > 1 ? crypto.randomUUID() : data.series_id

  let rows: (typeof data & { series_id: string | null })[]

  if (picked.length > 0) {
    rows = picked.map((d) => ({
      ...data,
      series_id:        seriesId,
      session_date:     d.date,
      session_time:     d.session_time,
      session_end_time: d.session_end_time,
    }))
  } else if (dayConfigs.length === 0) {
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

  let { data: inserted, error } = await supabase
    .from("training_sessions")
    .insert(rows.map(withoutPackage))
    .select("id, session_date")
  if (retrySansSibling(error, data)) {
    ({ data: inserted, error } = await supabase
      .from("training_sessions")
      .insert(rows.map((r) => withoutSibling(withoutPackage(r))))
      .select("id, session_date"))
  }
  if (error) {
    return {
      ids: [] as string[], created: [] as Array<{ id: string; session_date: string }>, seriesId: null,
      carried: [] as CarriedSignup[], error: writeErrorMessage(error.message),
    }
  }
  const created = (inserted ?? []).map((r) => ({ id: r.id as string, session_date: r.session_date as string }))
  const ids = created.map((r) => r.id)

  // Dates added to a whole-series package (a make-up session, say) belong to
  // everyone already registered for that series — they signed up for all of it.
  // A brand-new series has no one registered yet, so this adds nothing.
  let carried: CarriedSignup[] = []
  if (data.package_only && seriesId && ids.length > 0) {
    carried = await carryPackageSignups(supabase, seriesId, ids, data.max_players)
  }

  revalidatePath("/training")
  return { ids, created, seriesId, carried, error: null }
}

export type CarriedSignup = {
  id:             string
  session_id:     string
  player_id:      string
  parent_id:      string | null
  payment_method: string | null
  paid:           boolean
}

async function carryPackageSignups(
  supabase: Awaited<ReturnType<typeof createClient>>,
  seriesId: string,
  newSessionIds: string[],
  maxPlayers: number,
): Promise<CarriedSignup[]> {
  const { data: siblings } = await supabase
    .from("training_sessions")
    .select("id")
    .eq("series_id", seriesId)
  const isNew = new Set(newSessionIds)
  const otherIds = (siblings ?? []).map((r) => r.id as string).filter((id) => !isNew.has(id))
  if (otherIds.length === 0) return []

  const { data: existing } = await supabase
    .from("training_signups")
    .select("player_id, parent_id, payment_method, paid, reminder_email, reminder_sms, created_at")
    .in("session_id", otherIds)
    .order("created_at", { ascending: true })

  // One row per kid: their earliest signup's details; paid only if every one is.
  const byPlayer = new Map<string, { parent_id: string | null; payment_method: string | null; paid: boolean; reminder_email: boolean; reminder_sms: boolean }>()
  for (const su of existing ?? []) {
    const prev = byPlayer.get(su.player_id)
    if (prev) { prev.paid = prev.paid && !!su.paid; continue }
    byPlayer.set(su.player_id, {
      parent_id:      su.parent_id ?? null,
      payment_method: su.payment_method ?? null,
      paid:           !!su.paid,
      reminder_email: !!su.reminder_email,
      reminder_sms:   !!su.reminder_sms,
    })
  }
  const kids = [...byPlayer.entries()].slice(0, maxPlayers)
  const rows = newSessionIds.flatMap((session_id) => kids.map(([player_id, v]) => ({ session_id, player_id, ...v })))
  if (rows.length === 0) return []

  const { data: added, error } = await supabase
    .from("training_signups")
    .insert(rows)
    .select("id, session_id, player_id, parent_id, payment_method, paid")
  if (error) {
    console.error("[training] carry package signups:", error.message)
    return []
  }
  return (added ?? []) as CarriedSignup[]
}

export async function updateTrainingSession(id: string, data: SessionData) {
  const supabase = await createClient()
  let { error } = await supabase.from("training_sessions").update(withoutPackage(data)).eq("id", id)
  if (retrySansSibling(error, data)) {
    ({ error } = await supabase.from("training_sessions").update(withoutSibling(withoutPackage(data))).eq("id", id))
  }
  if (error) return { error: writeErrorMessage(error.message) }
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
    .select("*")
    .eq("id", sessionId)
    .single()
  if (!session) return { signupId: null, error: "Session not found" }
  if (session.package_only) return { signupId: null, error: "This series is sign-up-for-all-dates only — refresh the page and use Sign up." }

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
  track("training_signup", { session_title: session.title, session_date: session.session_date }).catch(() => {})
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
      .select("*")
      .eq("id", sessionId)
      .single()
    if (!session) continue
    if (session.package_only) continue

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
        paymentAmount:   calcBulkAmount(first.payment_amount, signedSessions.length),
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
    track("training_signup", { count: results.length, bulk: true }).catch(() => {})
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
    track("training_signup", { session_title: session.title, session_date: session.session_date, by_admin: true }).catch(() => {})
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

// Only the fields the caller actually included are written — every other column
// (each session's own time, photo, etc.) is left untouched. Passing a partial
// is the whole point: a bulk edit must never clobber fields you didn't change.
export async function adminBulkUpdateSessions(sessionIds: string[], data: Partial<BulkSessionUpdateData>) {
  const supabase = await createClient()
  if (Object.keys(data).length === 0 || sessionIds.length === 0) return { error: null }
  let { error } = await supabase.from("training_sessions").update(data).in("id", sessionIds)
  if (retrySansSibling(error, data)) {
    ({ error } = await supabase.from("training_sessions").update(withoutSibling(data)).in("id", sessionIds))
  }
  if (error) return { error: writeErrorMessage(error.message) }
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
    supabase.from("training_sessions").select("*").in("id", sessionIds).order("session_date", { ascending: true }),
    supabase.from("training_signups").select("session_id, player_id").in("session_id", sessionIds),
  ])

  const countBySession = new Map<string, number>()
  const alreadyIn = new Set<string>()
  for (const su of existingSignups ?? []) {
    countBySession.set(su.session_id, (countBySession.get(su.session_id) ?? 0) + 1)
    if (su.player_id === playerId) alreadyIn.add(su.session_id)
  }

  // Whole-series sibling price: how many of this kid's siblings (kids sharing
  // a parent) are already registered.
  let siblingsIn = 0
  const firstSession = (sessions ?? [])[0] as { package_only?: boolean; package_sibling_price?: string | null } | undefined
  if (firstSession?.package_only && firstSession.package_sibling_price) {
    const { data: myParents } = await supabase.from("player_parents").select("parent_id").eq("player_id", playerId)
    const parentIds = (myParents ?? []).map((r) => r.parent_id as string)
    if (parentIds.length > 0) {
      const { data: kin } = await supabase.from("player_parents").select("player_id").in("parent_id", parentIds)
      const siblingIds = new Set((kin ?? []).map((r) => r.player_id as string).filter((id) => id !== playerId))
      siblingsIn = new Set((existingSignups ?? []).filter((su) => siblingIds.has(su.player_id)).map((su) => su.player_id)).size
    }
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
        paymentAmount:   calcBulkAmount((first as any).payment_amount ?? null, signedSessions!.length),
        paymentMethods:  (first as any).payment_methods ?? [],
        packagePrice:    (first as any).package_only && !alreadyIn.size ? packageKidPrice((first as any).package_price, (first as any).package_sibling_price, siblingsIn) : null,
        siblingPrice:    !!(first as any).package_only && !alreadyIn.size && isSiblingPrice((first as any).package_sibling_price, siblingsIn),
        packageSeries:   !!(first as any).package_only,
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
      track("training_signup", { count: added.length, bulk: true, by_admin: true }).catch(() => {})
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
      track("training_cancel", { session_title: session.title, session_date: session.session_date }).catch(() => {})
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

// ── Whole-series ("package") signup ─────────────────────────────────────────

/**
 * Registers one kid for every upcoming date in a package series, all or
 * nothing: if any date the kid isn't already in is full, nothing is added.
 * Dates the kid is already in are skipped, so this also adds a date the coach
 * put on the series later.
 */
export async function signUpForTrainingSeries(
  seriesId:      string,
  playerId:      string,
  reminderEmail  = false,
  reminderSms    = false,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { results: [] as Array<{ sessionId: string; signupId: string }>, error: "Not authenticated" }

  const { data: parentLink } = await supabase
    .from("parent_auth")
    .select("parent_id, parents(first_name, last_name, email)")
    .eq("auth_user_id", user.id)
    .maybeSingle()
  if (!parentLink) return { results: [], error: "Not a parent account" }

  const { data: myPlayers } = await supabase.rpc("get_my_player_ids")
  if (!(myPlayers ?? []).some((r: { player_id: string }) => r.player_id === playerId)) {
    return { results: [], error: "You can only register your own kids." }
  }

  const today = new Date().toISOString().split("T")[0]
  const { data: sessions } = await supabase
    .from("training_sessions")
    .select("*")
    .eq("series_id", seriesId)
    .gte("session_date", today)
    .order("session_date", { ascending: true })
  if (!sessions || sessions.length === 0) return { results: [], error: "This series has no upcoming sessions." }
  if (!sessions[0].package_only) return { results: [], error: "This series is signed up for by date — refresh the page." }

  const sessionIds = sessions.map((s) => s.id as string)
  const { data: existing } = await supabase
    .from("training_signups")
    .select("session_id, player_id")
    .in("session_id", sessionIds)

  const countBySession = new Map<string, number>()
  const alreadyIn = new Set<string>()
  // This family's other kids already in the series — they decide whether this
  // kid pays the sibling price.
  const myIds = new Set(((myPlayers ?? []) as Array<{ player_id: string }>).map((r) => r.player_id))
  const siblingsIn = new Set<string>()
  for (const su of existing ?? []) {
    countBySession.set(su.session_id, (countBySession.get(su.session_id) ?? 0) + 1)
    if (su.player_id === playerId) alreadyIn.add(su.session_id)
    else if (myIds.has(su.player_id)) siblingsIn.add(su.player_id)
  }

  const toAdd = sessions.filter((s) => !alreadyIn.has(s.id))
  if (toAdd.length === 0) return { results: [], error: "Already registered for every session." }
  if (toAdd.some((s) => (countBySession.get(s.id) ?? 0) >= s.max_players)) {
    return { results: [], error: "Sorry — this series is full." }
  }

  // One insert = one statement, so it's all dates or none.
  const { data: rows, error } = await supabase
    .from("training_signups")
    .insert(toAdd.map((s) => ({
      session_id:     s.id,
      player_id:      playerId,
      parent_id:      parentLink.parent_id,
      reminder_email: reminderEmail,
      reminder_sms:   reminderSms,
    })))
    .select("id, session_id")
  if (error) return { results: [], error: error.message }

  const results = (rows ?? []).map((r) => ({ sessionId: r.session_id as string, signupId: r.id as string }))
  const first   = toAdd[0]
  const parent  = parentLink.parents as any

  const { data: playerRow } = await supabase.from("players").select("first_name, last_name").eq("id", playerId).single()
  const playerName = playerRow ? `${playerRow.first_name} ${playerRow.last_name}` : "your player"

  if (parent?.email) {
    sendTrainingConfirmation({
      type:            "signup",
      parentEmail:     parent.email,
      parentFirstName: parent.first_name ?? "there",
      playerName,
      sessionTitle:    first.title,
      sessionDate:     first.session_date,
      sessionTime:     first.session_time ?? null,
      sessionEndTime:  first.session_end_time ?? null,
      location:        first.location ?? null,
      paymentMethods:  first.payment_methods ?? [],
      // The series price only on the first registration — a date added later
      // was already paid for. A second kid from the family gets the sibling price.
      packagePrice:    alreadyIn.size === 0 ? packageKidPrice(first.package_price, first.package_sibling_price, siblingsIn.size) : null,
      siblingPrice:    alreadyIn.size === 0 && isSiblingPrice(first.package_sibling_price, siblingsIn.size),
      packageSeries:   true,
      imageUrl:        first.image_url ?? null,
      description:     first.description ?? null,
      notes:           first.notes ?? null,
      bulkDates:       toAdd.map((s) => ({ date: s.session_date, time: s.session_time ?? null, endTime: s.session_end_time ?? null })),
    }).catch((err) => console.error("[notify] signUpForTrainingSeries parent:", err))
  }

  logActivity(parentLink.parent_id, "training_signup", { series_id: seriesId, session_title: first.title, session_ids: results.map((r) => r.sessionId), count: results.length, player_id: playerId, package: true }).catch(() => {})
  track("training_signup", { session_title: first.title, count: results.length, package: true }).catch(() => {})

  revalidatePath("/parent/training")
  return { results, error: null }
}

/** Coach: mark a kid's whole-series registration paid/unpaid (every date at once). */
export async function markTrainingSignupsPaid(signupIds: string[], paid: boolean) {
  if (signupIds.length === 0) return { error: null }
  const supabase = await createClient()
  const { error } = await supabase.from("training_signups").update({ paid }).in("id", signupIds)
  if (error) return { error: error.message }
  revalidatePath("/training")
  return { error: null }
}

/** Coach: take a kid off every date of a series. */
export async function adminRemoveTrainingSignups(signupIds: string[]) {
  if (signupIds.length === 0) return { error: null }
  const supabase = await createClient()
  const { error } = await supabase.from("training_signups").delete().in("id", signupIds)
  if (error) return { error: error.message }
  revalidatePath("/training")
  return { error: null }
}

/**
 * Per-date RSVP inside a whole-series registration: the kid stays registered
 * (and keeps the spot and the price) but is marked as missing that date.
 * Coaches update directly (RLS allows it). Parents can't update signups under
 * RLS — and mustn't be able to touch `paid` — so after checking the kids are
 * theirs and the dates haven't passed, only `attending` is written with the
 * service client.
 */
export async function setTrainingAttendance(signupIds: string[], attending: boolean) {
  if (signupIds.length === 0) return { error: null }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { data: parentLink } = await supabase
    .from("parent_auth")
    .select("parent_id")
    .eq("auth_user_id", user.id)
    .maybeSingle()

  if (!parentLink) {
    const { error } = await supabase.from("training_signups").update({ attending }).in("id", signupIds)
    if (error) return { error: isMissingAttendingColumn(error.message) ? ATTENDANCE_MIGRATION_MSG : error.message }
    revalidatePath("/training")
    return { error: null }
  }

  const { data: myPlayers } = await supabase.rpc("get_my_player_ids")
  const mine = new Set(((myPlayers ?? []) as Array<{ player_id: string }>).map((r) => r.player_id))

  const { data: rows } = await supabase
    .from("training_signups")
    .select("id, player_id, training_sessions(title, session_date)")
    .in("id", signupIds)
  if (!rows || rows.length !== new Set(signupIds).size || rows.some((r) => !mine.has(r.player_id))) {
    return { error: "You can only change your own kids' sessions." }
  }
  const today = new Date().toISOString().split("T")[0]
  const sessions = rows.map((r) => r.training_sessions as unknown as { title: string; session_date: string } | null)
  if (sessions.some((s) => !s || s.session_date < today)) {
    return { error: "That session has already happened." }
  }

  const service = createServiceClient()
  const { error } = await service.from("training_signups").update({ attending }).in("id", signupIds)
  if (error) return { error: isMissingAttendingColumn(error.message) ? ATTENDANCE_MIGRATION_MSG : error.message }

  logActivity(parentLink.parent_id, "training_attendance", {
    session_title: sessions[0]?.title,
    session_date:  sessions.map((s) => s!.session_date).sort().join(", "),
    attending,
    player_ids:    [...new Set(rows.map((r) => r.player_id))],
  }).catch(() => {})
  track("training_attendance", { attending }).catch(() => {})

  revalidatePath("/parent/training")
  revalidatePath("/training")
  return { error: null }
}
