"use client"

import { useState, useTransition, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { createTrainingSession, updateTrainingSession, deleteTrainingSession, deleteTrainingSeries, adminAddTrainingSignup, adminRemoveTrainingSignup, markTrainingSignupPaid, adminBulkAddPlayerToSessions, adminBulkUpdateSessions, markTrainingSignupsPaid, adminRemoveTrainingSignups, setTrainingAttendance } from "../actions"
import type { SessionData, PaymentMethod, RepeatDayConfig, BulkSessionUpdateData, SpecificDate } from "../actions"
import { fmtPackagePrice, packageSummary } from "@/lib/training-package"
import { seriesTimesSummary, isWeeklySeries } from "@/lib/training-schedule"
import type { EligibilityRules } from "@/lib/training-eligibility"
import { describeRules } from "@/lib/training-eligibility"
import RuleBuilder, { type TeamOption } from "./RuleBuilder"

// ── Types ─────────────────────────────────────────────────────────────────────

export type PlayerOption = { id: string; first_name: string; last_name: string }

export type TrainingSession = {
  id:                string
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
  package_only:      boolean
  package_price:     string | null
  signups: Array<{
    id:             string
    player_id:      string
    payment_method: string | null
    paid:           boolean
    /** Whole series: false when marked as missing this date (unset = going). */
    attending?:     boolean
    players: { first_name: string; last_name: string } | null
    parents: { first_name: string; last_name: string } | null
  }>
}

const DAY_LABELS  = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const DAY_NAMES   = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

const PRESET_PAYMENTS: PaymentMethod[] = [
  { label: "Venmo",       link: "https://www.venmo.com/u/Connor-Small-1" },
  { label: "Apple Pay",   link: "tel:6232563187" },
  { label: "Zelle",       link: "tel:6232563187" },
  { label: "Cash / Check", link: null },
]

type DayTime = { time: string; end_time: string }

/** A hand-picked date; null time = the form's usual start/end time. */
type PickedDate = { date: string; time: string | null; end_time: string | null }

type FormState = {
  title:             string
  description:       string
  location:          string
  location_address:  string
  image_url:         string
  session_date:      string
  session_time:      string
  session_end_time:  string
  max_players:       string
  payment_amount:    string
  payment_methods:   PaymentMethod[]
  notes:             string
  eligibility_rules: EligibilityRules
  repeat_weekly:     boolean
  repeat_weeks:      string
  repeat_days:       number[]
  day_times:         Record<number, DayTime>
  series_id:         string
  package_only:      boolean
  package_price:     string
  /** "Pick dates" schedule: any days, not a weekly pattern. */
  specific_dates:    boolean
  picked:            PickedDate[]
}

const EMPTY_FORM: FormState = {
  title: "", description: "", location: "", location_address: "", image_url: "",
  session_date: "", session_time: "", session_end_time: "", max_players: "10",
  payment_amount: "", payment_methods: [], notes: "",
  eligibility_rules: null, repeat_weekly: false, repeat_weeks: "4",
  repeat_days: [], day_times: {}, series_id: "",
  package_only: false, package_price: "",
  specific_dates: false, picked: [],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function generateSessionDates(
  startDate: string,
  repeatWeeks: number,
  dayConfigs: RepeatDayConfig[],
): Array<{ date: string; time: string | null; endTime: string | null }> {
  if (dayConfigs.length === 0) {
    return Array.from({ length: repeatWeeks }, (_, i) => ({
      date:    i === 0 ? startDate : addWeeks(startDate, i),
      time:    null,
      endTime: null,
    }))
  }
  const startDay = new Date(startDate + "T00:00:00").getDay()
  const rows: Array<{ date: string; time: string | null; endTime: string | null }> = []
  for (const cfg of dayConfigs) {
    const offset = (cfg.day - startDay + 7) % 7
    for (let week = 0; week < repeatWeeks; week++) {
      rows.push({
        date:    addDays(startDate, offset + week * 7),
        time:    cfg.session_time,
        endTime: cfg.session_end_time,
      })
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date))
}

function addMinutes(timeStr: string, mins: number): string {
  if (!timeStr) return ""
  const [h, m] = timeStr.split(":").map(Number)
  const total  = h * 60 + m + mins
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

const DURATION_SHORTCUTS = [30, 50, 60, 90] as const

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  })
}

function fmtShortDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function groupBySeries(sessions: TrainingSession[]) {
  const map = new Map<string, TrainingSession[]>()
  for (const s of sessions) {
    const key = s.series_id ?? s.id
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(s)
  }
  for (const group of map.values()) {
    group.sort((a, b) => a.session_date.localeCompare(b.session_date))
  }
  return map
}

function fmtTime(t: string | null) {
  if (!t) return null
  const [h, m] = t.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
}

function isPast(dateStr: string) {
  return new Date(dateStr + "T23:59:59") < new Date()
}

type BulkFormState = {
  title:             string
  description:       string
  location:          string
  location_address:  string
  image_url:         string
  session_time:      string
  session_end_time:  string
  max_players:       string
  payment_amount:    string
  payment_methods:   PaymentMethod[]
  notes:             string
  eligibility_rules: EligibilityRules
  package_only:      boolean
  package_price:     string
}

// Which bulk-edit fields the user opted to change, and how each maps to columns.
type BulkFieldKey =
  | "title" | "description" | "time" | "location"
  | "max_players" | "payment_amount" | "payment_methods" | "eligibility_rules"
  | "notes" | "image" | "package"

const BULK_FIELD_LABELS: Record<BulkFieldKey, string> = {
  title: "Title",
  description: "Description",
  time: "Start/end time",
  location: "Location",
  max_players: "Max players",
  payment_amount: "Price",
  payment_methods: "Payment methods",
  eligibility_rules: "Eligibility",
  notes: "Notes",
  image: "Photo",
  package: "Whole-series signup",
}

// Build a partial update from only the toggled-on fields.
function buildBulkPartial(f: BulkFormState, on: (k: BulkFieldKey) => boolean): Partial<BulkSessionUpdateData> {
  const d: Partial<BulkSessionUpdateData> = {}
  if (on("title")) d.title = f.title
  if (on("description")) d.description = f.description || null
  if (on("time")) {
    d.session_time = f.session_time || null
    d.session_end_time = f.session_end_time || null
  }
  if (on("location")) {
    d.location = f.location || null
    d.location_address = f.location_address || null
  }
  if (on("max_players")) d.max_players = Math.max(1, parseInt(f.max_players) || 10)
  if (on("payment_amount")) d.payment_amount = f.payment_amount || null
  if (on("payment_methods")) d.payment_methods = f.payment_methods
  if (on("eligibility_rules")) d.eligibility_rules = f.eligibility_rules
  if (on("notes")) d.notes = f.notes || null
  if (on("image")) d.image_url = f.image_url || null
  if (on("package")) {
    d.package_only  = f.package_only
    d.package_price = f.package_only ? f.package_price.trim() || null : null
    // A package has one price for the series, not a price per session.
    if (f.package_only) d.payment_amount = null
  }
  return d
}

// ── SessionList ───────────────────────────────────────────────────────────────

export default function SessionList({
  initialSessions, teams, players,
}: {
  initialSessions: TrainingSession[]
  teams:           TeamOption[]
  players:         PlayerOption[]
}) {
  const [sessions, setSessions]       = useState(initialSessions)
  const [adding, setAdding]           = useState(false)
  const [editingId, setEditId]        = useState<string | null>(null)
  const [expandedId, setExpandedId]   = useState<string | null>(null)
  const [form, setForm]               = useState<FormState>(EMPTY_FORM)
  const [error, setError]             = useState<string | null>(null)
  const [pending, start]              = useTransition()
  const [imageUploading, setImgUpload] = useState(false)

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImgUpload(true)
    const supabase = createClient()
    const ext  = file.name.split(".").pop() ?? "jpg"
    const path = `sessions/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from("training-images").upload(path, file)
    if (!upErr) {
      const { data: urlData } = supabase.storage.from("training-images").getPublicUrl(path)
      setForm((f) => ({ ...f, image_url: urlData.publicUrl }))
    }
    setImgUpload(false)
  }

  function toggleDay(day: number) {
    setForm((f) => {
      if (f.repeat_days.includes(day)) {
        const newDays  = f.repeat_days.filter((d) => d !== day)
        const newTimes = { ...f.day_times }
        delete newTimes[day]
        return { ...f, repeat_days: newDays, day_times: newTimes }
      } else {
        return {
          ...f,
          repeat_days: [...f.repeat_days, day].sort((a, b) => a - b),
          day_times:   { ...f.day_times, [day]: { time: f.session_time, end_time: f.session_end_time } },
        }
      }
    })
  }

  const upcomingCount = sessions.filter((s) => !isPast(s.session_date)).length
  const pastCount     = sessions.filter((s) =>  isPast(s.session_date)).length

  const grouped = useMemo(() => groupBySeries(sessions), [sessions])

  const ongoingGroups = useMemo(() =>
    [...grouped.values()]
      .filter((g) => g.some((s) => !isPast(s.session_date)))
      .sort((a, b) => {
        const aNext = (a.find((s) => !isPast(s.session_date)) ?? a[0]).session_date
        const bNext = (b.find((s) => !isPast(s.session_date)) ?? b[0]).session_date
        return aNext.localeCompare(bNext)
      }),
    [grouped]
  )

  const pastGroups = useMemo(() =>
    [...grouped.values()]
      .filter((g) => g.every((s) => isPast(s.session_date)))
      .sort((a, b) => b[b.length - 1].session_date.localeCompare(a[a.length - 1].session_date)),
    [grouped]
  )

  const seriesOptions = useMemo(() => {
    const map = new Map<string, TrainingSession[]>()
    for (const s of sessions) {
      if (!s.series_id) continue
      if (!map.has(s.series_id)) map.set(s.series_id, [])
      map.get(s.series_id)!.push(s)
    }
    return Array.from(map.entries()).map(([sid, sess]) => {
      const sorted = [...sess].sort((a, b) => a.session_date.localeCompare(b.session_date))
      const last   = sorted[sorted.length - 1]
      return {
        id:    sid,
        label: `${sorted[0].title} · ${fmtDate(sorted[0].session_date)} – ${fmtDate(last.session_date)} (${sess.length})`,
      }
    })
  }, [sessions])

  function openAdd() {
    setForm(EMPTY_FORM)
    setEditId(null)
    setAdding(true)
    setError(null)
  }

  function sessionToForm(s: TrainingSession, clearDate = false): FormState {
    return {
      title:             s.title,
      description:       s.description      ?? "",
      location:          s.location         ?? "",
      location_address:  s.location_address ?? "",
      image_url:         s.image_url        ?? "",
      session_date:      clearDate ? "" : s.session_date,
      session_time:      s.session_time     ?? "",
      session_end_time:  s.session_end_time ?? "",
      max_players:       String(s.max_players),
      payment_amount:    s.payment_amount   ?? "",
      payment_methods:   s.payment_methods  ?? [],
      notes:             s.notes            ?? "",
      eligibility_rules: s.eligibility_rules,
      repeat_weekly:     false,
      repeat_weeks:      "4",
      repeat_days:       [],
      day_times:         {},
      series_id:         s.series_id        ?? "",
      package_only:      s.package_only,
      package_price:     s.package_price    ?? "",
      specific_dates:    false,
      picked:            [],
    }
  }

  function openEdit(s: TrainingSession) {
    setForm(sessionToForm(s))
    setEditId(s.id)
    setAdding(false)
    setError(null)
  }

  function openDuplicate(s: TrainingSession) {
    setForm(sessionToForm(s, true))
    setEditId(null)
    setAdding(true)
    setError(null)
  }

  function closeForm() {
    setAdding(false)
    setEditId(null)
    setError(null)
  }

  const repeatTotal = form.repeat_weekly
    ? Math.max(1, parseInt(form.repeat_weeks) || 1) * (form.repeat_days.length || 1)
    : 1
  // Sessions the create form will make.
  const sessionCount = form.repeat_weekly ? repeatTotal : form.specific_dates ? form.picked.length : 1
  // Creating a new series (where the whole-series toggle + price live), as
  // opposed to adding dates to an existing series, which inherit its settings.
  const makesNewSeries = !editingId && (form.repeat_weekly || (form.specific_dates && !form.series_id))
  // A package needs a series: several new dates, or dates in an existing series.
  const formIsPackage = form.package_only && (
    form.repeat_weekly ? repeatTotal > 1
      : form.specific_dates ? (!!form.series_id || form.picked.length > 1)
      : !!form.series_id
  )
  const pickedSorted = [...form.picked].sort((a, b) => a.date.localeCompare(b.date))

  // The series a dropdown choice points at → its whole-series settings.
  function seriesPackage(seriesId: string) {
    const series = seriesId ? sessions.find((s) => s.series_id === seriesId) : undefined
    return { package_only: series?.package_only ?? false, package_price: series?.package_price ?? "" }
  }

  function setSchedule(mode: "once" | "weekly" | "dates") {
    setForm((f) => {
      if (mode === "weekly") {
        const next: FormState = { ...f, repeat_weekly: true, specific_dates: false }
        if (f.session_date && f.repeat_days.length === 0) {
          const day = new Date(f.session_date + "T00:00:00").getDay()
          next.repeat_days = [day]
          next.day_times   = { [day]: { time: f.session_time, end_time: f.session_end_time } }
        }
        return next
      }
      if (mode === "dates") {
        return {
          ...f,
          repeat_weekly:  false,
          specific_dates: true,
          // Start from the date already typed in, if any.
          picked: f.picked.length === 0 && f.session_date ? [{ date: f.session_date, time: null, end_time: null }] : f.picked,
        }
      }
      return { ...f, repeat_weekly: false, specific_dates: false, ...seriesPackage(f.series_id) }
    })
  }

  function toData(): SessionData {
    return {
      title:             form.title,
      description:       form.description       || null,
      location:          form.location          || null,
      location_address:  form.location_address  || null,
      image_url:         form.image_url         || null,
      session_date:      form.specific_dates ? pickedSorted[0]?.date ?? "" : form.session_date,
      session_time:      form.session_time      || null,
      session_end_time:  form.session_end_time  || null,
      max_players:       Math.max(1, parseInt(form.max_players) || 10),
      payment_amount:    formIsPackage ? null : form.payment_amount || null,
      payment_methods:   form.payment_methods,
      eligibility_rules: form.eligibility_rules,
      notes:             form.notes             || null,
      series_id:         form.series_id         || null,
      package_only:      formIsPackage,
      package_price:     formIsPackage ? form.package_price.trim() || null : null,
    }
  }

  function buildDayConfigs(): RepeatDayConfig[] {
    if (!form.repeat_weekly || form.repeat_days.length === 0) return []
    return form.repeat_days.map((day) => ({
      day,
      session_time:     form.day_times[day]?.time     || form.session_time     || null,
      session_end_time: form.day_times[day]?.end_time || form.session_end_time || null,
    }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title) return
    if (form.specific_dates && !editingId ? form.picked.length === 0 : !form.session_date) return
    setError(null)
    const data      = toData()
    const repeatWeeks = form.repeat_weekly ? Math.max(1, parseInt(form.repeat_weeks) || 1) : 1
    const dayConfigs  = buildDayConfigs()
    const specificDates: SpecificDate[] = form.specific_dates && !editingId
      ? pickedSorted.map((p) => ({
          date:             p.date,
          session_time:     p.time     ?? (form.session_time     || null),
          session_end_time: p.end_time ?? (form.session_end_time || null),
        }))
      : []

    start(async () => {
      if (editingId) {
        const result = await updateTrainingSession(editingId, data)
        if (result.error) { setError(result.error); return }
        setSessions((prev) =>
          prev.map((s) => s.id === editingId ? { ...s, ...data } : s)
        )
      } else {
        const result = await createTrainingSession(data, repeatWeeks, dayConfigs, specificDates)
        if (result.error) { setError(result.error); return }
        const dates  = specificDates.length > 0
          ? specificDates.map((d) => ({ date: d.date, time: d.session_time, endTime: d.session_end_time }))
          : generateSessionDates(data.session_date, repeatWeeks, dayConfigs)
        // Kids registered for a package series were added to the new date too.
        const known = new Map<string, TrainingSession["signups"][0]>()
        for (const s of sessions) for (const su of s.signups) if (!known.has(su.player_id)) known.set(su.player_id, su)
        const carried: TrainingSession["signups"] = result.carried.map((c) => ({
          id:             c.id,
          player_id:      c.player_id,
          payment_method: c.payment_method,
          paid:           c.paid,
          players:        known.get(c.player_id)?.players ?? null,
          parents:        known.get(c.player_id)?.parents ?? null,
        }))
        const newRows = dates.map(({ date, time, endTime }, i) => {
          const id = result.created.find((c) => c.session_date === date)?.id ?? result.ids[i] ?? crypto.randomUUID()
          return {
            id,
            ...data,
            series_id:        result.seriesId,
            session_date:     date,
            session_time:     time     ?? data.session_time,
            session_end_time: endTime  ?? data.session_end_time,
            signups:          carried.filter((_, j) => result.carried[j].session_id === id),
          }
        })
        setSessions((prev) =>
          [...prev, ...newRows].sort((a, b) => a.session_date.localeCompare(b.session_date))
        )
      }
      closeForm()
    })
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this session? All signups will be removed.")) return
    start(async () => {
      const result = await deleteTrainingSession(id)
      if (result.error) { setError(result.error); return }
      setSessions((prev) => prev.filter((s) => s.id !== id))
    })
  }

  function handleDeleteSeries(seriesId: string, ids: string[]) {
    const count = ids.length
    if (!confirm(`Delete all ${count} session${count !== 1 ? "s" : ""} in this series? All signups will be removed.`)) return
    start(async () => {
      const result = await deleteTrainingSeries(seriesId)
      if (result.error) { setError(result.error); return }
      setSessions((prev) => prev.filter((s) => !ids.includes(s.id)))
    })
  }

  function openDuplicateSeries(group: TrainingSession[]) {
    const first      = group[0]
    const uniqueDays = [...new Set(group.map((s) => new Date(s.session_date + "T00:00:00").getDay()))].sort((a, b) => a - b)
    const repeatWeeks = uniqueDays.length > 0 ? Math.ceil(group.length / uniqueDays.length) : group.length
    const day_times: Record<number, DayTime> = {}
    for (const day of uniqueDays) {
      const match = group.find((s) => new Date(s.session_date + "T00:00:00").getDay() === day)
      if (match) day_times[day] = { time: match.session_time ?? "", end_time: match.session_end_time ?? "" }
    }
    if (group.length > 1 && !isWeeklySeries(group)) {
      // Hand-picked dates: start from the same upcoming dates (handy for a
      // second age group); untick or clear them for a new run.
      const usual = { time: first.session_time ?? "", end: first.session_end_time ?? "" }
      setForm({
        ...sessionToForm(first, true),
        series_id:      "",
        specific_dates: true,
        picked: group
          .filter((s) => !isPast(s.session_date))
          .map((s) => ({
            date:     s.session_date,
            time:     (s.session_time ?? "") === usual.time ? null : s.session_time,
            end_time: (s.session_end_time ?? "") === usual.end ? null : s.session_end_time,
          })),
      })
      setEditId(null)
      setAdding(true)
      setError(null)
      return
    }
    setForm({
      ...sessionToForm(first, true),
      repeat_weekly: group.length > 1,
      repeat_weeks:  String(repeatWeeks),
      repeat_days:   uniqueDays,
      day_times,
    })
    setEditId(null)
    setAdding(true)
    setError(null)
  }

  const inputCls = "w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {sessions.length === 0
            ? "No sessions yet"
            : `${upcomingCount} upcoming · ${pastCount} past`}
        </p>
        <button
          onClick={openAdd}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          + New session
        </button>
      </div>

      {/* Add / edit form */}
      {(adding || editingId) && (
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-gray-900 rounded-xl border border-blue-200 dark:border-blue-800 p-5 space-y-4"
        >
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {editingId ? "Edit session" : "New session"}
          </p>

          {/* Title */}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Title *</label>
            <input
              type="text" required placeholder="e.g. Speed & Agility"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className={inputCls}
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Description</label>
            <textarea
              rows={2} placeholder="What will players work on?"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className={`${inputCls} resize-none`}
            />
          </div>

          {/* Date + time (picking dates: the times are the usual ones) */}
          <div className={`grid gap-3 ${form.specific_dates && !editingId ? "grid-cols-2" : "grid-cols-3"}`}>
            {!(form.specific_dates && !editingId) && <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Date *</label>
              <input
                type="date" required
                value={form.session_date}
                onChange={(e) => {
                  const updates: Partial<FormState> = { session_date: e.target.value }
                  if (form.repeat_weekly && form.repeat_days.length === 0 && e.target.value) {
                    const day = new Date(e.target.value + "T00:00:00").getDay()
                    updates.repeat_days = [day]
                    updates.day_times   = { [day]: { time: form.session_time, end_time: form.session_end_time } }
                  }
                  setForm((f) => ({ ...f, ...updates }))
                }}
                className={inputCls}
              />
            </div>}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                {form.specific_dates && !editingId ? "Usual start time" : "Start time"}
              </label>
              <input
                type="time"
                value={form.session_time}
                onChange={(e) => setForm((f) => ({ ...f, session_time: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                {form.specific_dates && !editingId ? "Usual end time" : "End time"}
              </label>
              <input
                type="time"
                value={form.session_end_time}
                onChange={(e) => setForm((f) => ({ ...f, session_end_time: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>
          {/* Duration shortcuts */}
          {form.session_time && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400 dark:text-gray-500">Duration:</span>
              {DURATION_SHORTCUTS.map((mins) => (
                <button
                  key={mins} type="button"
                  onClick={() => setForm((f) => ({ ...f, session_end_time: addMinutes(f.session_time, mins) }))}
                  className="text-xs rounded-full px-2.5 py-0.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  {mins} min
                </button>
              ))}
            </div>
          )}

          {/* Schedule: one date, a weekly pattern, or hand-picked dates (create only) */}
          {!editingId && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div role="radiogroup" aria-label="Schedule" className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5">
                  {([
                    ["once",   "One date"],
                    ["weekly", "Repeat weekly"],
                    ["dates",  "Pick dates"],
                  ] as const).map(([mode, label]) => {
                    const active = mode === "weekly" ? form.repeat_weekly : mode === "dates" ? form.specific_dates : !form.repeat_weekly && !form.specific_dates
                    return (
                      <button
                        key={mode} type="button" role="radio" aria-checked={active}
                        onClick={() => setSchedule(mode)}
                        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                          active
                            ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                        }`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
                {form.repeat_weekly && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">for</span>
                    <input
                      type="number" min={2} max={52}
                      value={form.repeat_weeks}
                      onChange={(e) => setForm((f) => ({ ...f, repeat_weeks: e.target.value }))}
                      className="w-16 rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400">weeks</span>
                  </div>
                )}
              </div>

              {/* Day-of-week toggles */}
              {form.repeat_weekly && (
                <div className="space-y-2">
                  <div className="flex gap-1.5 flex-wrap">
                    {DAY_LABELS.map((label, day) => (
                      <button
                        key={day} type="button"
                        onClick={() => toggleDay(day)}
                        className={`w-9 h-9 rounded-lg text-xs font-semibold transition-colors ${
                          form.repeat_days.includes(day)
                            ? "bg-blue-600 text-white"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Per-day times when 2+ days selected */}
                  {form.repeat_days.length >= 2 && (
                    <div className="space-y-2 pl-1">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Times per day</p>
                      {form.repeat_days.map((day) => (
                        <div key={day} className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 w-24 shrink-0">
                              {DAY_NAMES[day]}
                            </span>
                            <input
                              type="time"
                              value={form.day_times[day]?.time ?? ""}
                              onChange={(e) => setForm((f) => ({
                                ...f,
                                day_times: { ...f.day_times, [day]: { ...f.day_times[day], time: e.target.value } },
                              }))}
                              className="w-28 rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <span className="text-xs text-gray-400">–</span>
                            <input
                              type="time"
                              value={form.day_times[day]?.end_time ?? ""}
                              onChange={(e) => setForm((f) => ({
                                ...f,
                                day_times: { ...f.day_times, [day]: { ...f.day_times[day], end_time: e.target.value } },
                              }))}
                              className="w-28 rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          {form.day_times[day]?.time && (
                            <div className="flex items-center gap-1.5 pl-[7rem]">
                              {DURATION_SHORTCUTS.map((mins) => (
                                <button
                                  key={mins} type="button"
                                  onClick={() => setForm((f) => ({
                                    ...f,
                                    day_times: { ...f.day_times, [day]: { ...f.day_times[day], end_time: addMinutes(f.day_times[day]?.time ?? "", mins) } },
                                  }))}
                                  className="text-[10px] rounded-full px-2 py-0.5 border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                >
                                  {mins}m
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Hand-picked dates */}
              {form.specific_dates && (
                <MultiDatePicker
                  picked={form.picked}
                  usualTime={form.session_time}
                  usualEnd={form.session_end_time}
                  onChange={(picked) => setForm((f) => ({ ...f, picked }))}
                />
              )}

              {/* Whole-series signup (a new series; dates added to an existing one inherit it) */}
              {makesNewSeries && (
                <label className={`flex items-start gap-2.5 cursor-pointer rounded-lg border px-3 py-2.5 transition-colors ${
                  form.package_only
                    ? "border-blue-300 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-950/30"
                    : "border-gray-200 dark:border-gray-700"
                }`}>
                  <input
                    type="checkbox"
                    checked={form.package_only}
                    onChange={(e) => setForm((f) => ({ ...f, package_only: e.target.checked }))}
                    className="accent-blue-600 mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-gray-800 dark:text-gray-200">
                      Parents sign up for the whole series
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {sessionCount < 2
                        ? "Pick 2 or more dates to make a series."
                        : `One registration covers all ${sessionCount} sessions at one price. Parents can’t pick single dates.`}
                    </span>
                  </span>
                </label>
              )}
            </div>
          )}

          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Location name</label>
            <input
              type="text" placeholder="e.g. Dobson Park"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Location address</label>
            <input
              type="text" placeholder="e.g. 100 E Dobson Rd, Mesa, AZ"
              value={form.location_address}
              onChange={(e) => setForm((f) => ({ ...f, location_address: e.target.value }))}
              className={inputCls}
            />
          </div>

          {/* Max players + price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Max players</label>
              <input
                type="number" min={1} max={100}
                value={form.max_players}
                onChange={(e) => setForm((f) => ({ ...f, max_players: e.target.value }))}
                className={inputCls}
              />
            </div>
            {formIsPackage && !makesNewSeries ? (
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Price</label>
                <p className="text-sm text-gray-700 dark:text-gray-300 py-1.5">
                  {fmtPackagePrice(form.package_price) ?? "No price"} for the series
                </p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">Change it with &ldquo;Edit all&rdquo; on the series.</p>
              </div>
            ) : formIsPackage ? (
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                  Price for all {sessionCount} sessions
                </label>
                <input
                  type="text" placeholder="e.g. $75"
                  value={form.package_price}
                  onChange={(e) => setForm((f) => ({ ...f, package_price: e.target.value }))}
                  className={inputCls}
                />
              </div>
            ) : (
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Price</label>
                <input
                  type="text" placeholder="e.g. $20"
                  value={form.payment_amount}
                  onChange={(e) => setForm((f) => ({ ...f, payment_amount: e.target.value }))}
                  className={inputCls}
                />
              </div>
            )}
          </div>
          {formIsPackage && makesNewSeries && (
            <p className="text-xs text-blue-700 dark:text-blue-300 -mt-2">
              Parents see: <strong>{packageSummary(form.package_price, sessionCount)}</strong>
            </p>
          )}

          {/* Payment methods */}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1.5">Payment methods</label>
            <div className="space-y-2">
              {form.payment_methods.map((pm, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text" placeholder="Label"
                    value={pm.label}
                    onChange={(e) => {
                      const updated = [...form.payment_methods]
                      updated[i] = { ...pm, label: e.target.value }
                      setForm((f) => ({ ...f, payment_methods: updated }))
                    }}
                    className="w-32 rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <input
                    type="url" placeholder="Link (optional)"
                    value={pm.link ?? ""}
                    onChange={(e) => {
                      const updated = [...form.payment_methods]
                      updated[i] = { ...pm, link: e.target.value || null }
                      setForm((f) => ({ ...f, payment_methods: updated }))
                    }}
                    className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, payment_methods: f.payment_methods.filter((_, idx) => idx !== i) }))}
                    className="text-red-400 hover:text-red-600 text-base shrink-0"
                  >
                    ×
                  </button>
                </div>
              ))}
              {/* Quick-add presets */}
              <div className="flex flex-wrap gap-2 pt-0.5">
                {PRESET_PAYMENTS.map((preset) => {
                  const alreadyAdded = form.payment_methods.some((pm) => pm.label === preset.label)
                  return (
                    <button
                      key={preset.label} type="button"
                      disabled={alreadyAdded}
                      onClick={() => setForm((f) => ({ ...f, payment_methods: [...f.payment_methods, preset] }))}
                      className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                        alreadyAdded
                          ? "border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600 cursor-default"
                          : "border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950"
                      }`}
                    >
                      + {preset.label}
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, payment_methods: [...f.payment_methods, { label: "", link: null }] }))}
                  className="text-xs text-gray-400 dark:text-gray-500 hover:underline"
                >
                  + Custom
                </button>
              </div>
            </div>
          </div>

          {/* Eligibility rules */}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1.5">Eligibility</label>
            <RuleBuilder
              value={form.eligibility_rules}
              onChange={(v) => setForm((f) => ({ ...f, eligibility_rules: v }))}
              teams={teams}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Notes</label>
            <input
              type="text" placeholder="Optional"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className={inputCls}
            />
          </div>

          {/* Image */}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1.5">Photo</label>
            {form.image_url ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.image_url} alt="" className="h-20 w-32 object-cover rounded-lg border border-gray-200 dark:border-gray-700" />
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, image_url: "" }))}
                  className="text-xs text-red-500 hover:underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <label className="cursor-pointer inline-flex items-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                {imageUploading ? "Uploading…" : "Upload photo"}
                <input
                  type="file" accept="image/*"
                  className="hidden"
                  disabled={imageUploading}
                  onChange={handleImageUpload}
                />
              </label>
            )}
          </div>

          {/* Series — one date or picked dates can join an existing series
              (weekly always creates its own) */}
          {!form.repeat_weekly && seriesOptions.length > 0 && (
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                {form.specific_dates && !editingId ? "Add these dates to" : "Series"}
              </label>
              <select
                value={form.series_id}
                onChange={(e) => {
                  // A date in a whole-series package is part of that package.
                  const id = e.target.value
                  setForm((f) => ({ ...f, series_id: id, ...seriesPackage(id) }))
                }}
                className={inputCls}
              >
                <option value="">
                  {form.specific_dates && !editingId && form.picked.length > 1 ? "A new series" : "Standalone session"}
                </option>
                {seriesOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
              {formIsPackage && !editingId && (
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  Whole-series signup: everyone registered for this series is added to {sessionCount > 1 ? "these dates" : "this date"} too.
                </p>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={pending || !form.title || (form.specific_dates && !editingId ? form.picked.length === 0 : !form.session_date)}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {(() => {
                if (pending) return "Saving…"
                if (editingId) return "Save changes"
                if (form.specific_dates) {
                  const n = form.picked.length
                  return n === 0 ? "Pick dates above" : `Create ${n} session${n !== 1 ? "s" : ""}`
                }
                if (!form.repeat_weekly) return "Create session"
                const weeks = parseInt(form.repeat_weeks) || 1
                const days  = form.repeat_days.length || 1
                const total = weeks * days
                return `Create ${total} session${total !== 1 ? "s" : ""}`
              })()}
            </button>
            <button type="button" onClick={closeForm}
              className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Ongoing / upcoming groups */}
      {ongoingGroups.length > 0 && (
        <div className="space-y-2">
          {ongoingGroups.map((g) => (
            <AdminSeriesGroup
              key={g[0].series_id ?? g[0].id}
              sessions={g}
              players={players}
              teams={teams}
              expandedId={expandedId}
              onToggleExpand={(id) => setExpandedId((v) => v === id ? null : id)}
              onEdit={openEdit}
              onDuplicate={openDuplicate}
              onDelete={(id) => handleDelete(id)}
              onDuplicateSeries={() => openDuplicateSeries(g)}
              onDeleteSeries={() => handleDeleteSeries(g[0].series_id ?? g[0].id, g.map((s) => s.id))}
              onSignupAdded={(sid, su) => setSessions((prev) => prev.map((p) => p.id === sid ? { ...p, signups: [...p.signups, su] } : p))}
              onSignupRemoved={(sid, suId) => setSessions((prev) => prev.map((p) => p.id === sid ? { ...p, signups: p.signups.filter((su) => su.id !== suId) } : p))}
              onSignupPaidToggled={(sid, suId, paid) => setSessions((prev) => prev.map((p) => p.id === sid ? { ...p, signups: p.signups.map((su) => su.id === suId ? { ...su, paid } : su) } : p))}
              onAttendanceChanged={(sid, suId, attending) => setSessions((prev) => prev.map((p) => p.id === sid ? { ...p, signups: p.signups.map((su) => su.id === suId ? { ...su, attending } : su) } : p))}
              onBulkUpdated={(ids, data) => setSessions((prev) => prev.map((s) => ids.includes(s.id) ? { ...s, ...data } : s))}
            />
          ))}
        </div>
      )}

      {/* All-past groups */}
      {pastGroups.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
            Past sessions
          </p>
          <div className="space-y-2 opacity-50">
            {pastGroups.map((g) => (
              <AdminSeriesGroup
                key={g[0].series_id ?? g[0].id}
                sessions={g}
                players={players}
                teams={teams}
                expandedId={expandedId}
                onToggleExpand={(id) => setExpandedId((v) => v === id ? null : id)}
                onEdit={openEdit}
                onDuplicate={openDuplicate}
                onDelete={(id) => handleDelete(id)}
                onDuplicateSeries={() => openDuplicateSeries(g)}
                onDeleteSeries={() => handleDeleteSeries(g[0].series_id ?? g[0].id, g.map((s) => s.id))}
                onSignupAdded={(sid, su) => setSessions((prev) => prev.map((p) => p.id === sid ? { ...p, signups: [...p.signups, su] } : p))}
                onSignupRemoved={(sid, suId) => setSessions((prev) => prev.map((p) => p.id === sid ? { ...p, signups: p.signups.filter((su) => su.id !== suId) } : p))}
                onSignupPaidToggled={(sid, suId, paid) => setSessions((prev) => prev.map((p) => p.id === sid ? { ...p, signups: p.signups.map((su) => su.id === suId ? { ...su, paid } : su) } : p))}
                onAttendanceChanged={(sid, suId, attending) => setSessions((prev) => prev.map((p) => p.id === sid ? { ...p, signups: p.signups.map((su) => su.id === suId ? { ...su, attending } : su) } : p))}
                onBulkUpdated={(ids, data) => setSessions((prev) => prev.map((s) => ids.includes(s.id) ? { ...s, ...data } : s))}
              />
            ))}
          </div>
        </div>
      )}

      {sessions.length === 0 && !adding && (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <p className="text-sm">No training sessions yet.</p>
          <button onClick={openAdd}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-1">
            Create the first session →
          </button>
        </div>
      )}
    </div>
  )
}

// ── MultiDatePicker ───────────────────────────────────────────────────────────
// Tap days on a month calendar to build a series from any dates. Each picked
// date uses the usual time unless the coach changes it on that date's row.

const ymd = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`

function MultiDatePicker({
  picked, usualTime, usualEnd, onChange,
}: {
  picked:    PickedDate[]
  usualTime: string
  usualEnd:  string
  onChange:  (picked: PickedDate[]) => void
}) {
  const sorted = [...picked].sort((a, b) => a.date.localeCompare(b.date))
  const [view, setView] = useState(() => {
    const d = sorted[0] ? new Date(sorted[0].date + "T00:00:00") : new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const now      = new Date()
  const todayKey = ymd(now.getFullYear(), now.getMonth(), now.getDate())
  const isPicked = new Set(picked.map((p) => p.date))

  const firstDow    = new Date(view.y, view.m, 1).getDay()
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  const monthLabel  = new Date(view.y, view.m, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })
  const inMonth     = picked.filter((p) => p.date.startsWith(ymd(view.y, view.m, 1).slice(0, 8))).length

  const add = (dates: string[]) =>
    onChange([...picked, ...dates.filter((d) => !isPicked.has(d)).map((date) => ({ date, time: null, end_time: null }))])

  function toggle(date: string) {
    if (isPicked.has(date)) onChange(picked.filter((p) => p.date !== date))
    else add([date])
  }

  // Tap a weekday heading: every one of those days this month (or none, if all are picked).
  function toggleWeekday(dow: number) {
    const dates: string[] = []
    for (let d = 1; d <= daysInMonth; d++) if (new Date(view.y, view.m, d).getDay() === dow) dates.push(ymd(view.y, view.m, d))
    if (dates.every((d) => isPicked.has(d))) onChange(picked.filter((p) => !dates.includes(p.date)))
    else add(dates)
  }

  function setTime(date: string, key: "time" | "end_time", value: string) {
    const usual = key === "time" ? usualTime : usualEnd
    onChange(picked.map((p) => (p.date === date ? { ...p, [key]: value === usual ? null : value } : p)))
  }

  const shift = (n: number) => setView((v) => {
    const d = new Date(v.y, v.m + n, 1)
    return { y: d.getFullYear(), m: d.getMonth() }
  })

  const timeCls = (custom: boolean) =>
    `w-[6.75rem] rounded-lg border px-2 py-1 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 ${
      custom ? "border-blue-400 dark:border-blue-500" : "border-gray-300 dark:border-gray-600"
    }`

  return (
    <div className="space-y-3 @container">
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 max-w-sm">
        <div className="flex items-center justify-between mb-2">
          <button type="button" onClick={() => shift(-1)} aria-label="Previous month"
            className="h-8 w-8 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">‹</button>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {monthLabel}
            {inMonth > 0 && <span className="ml-1.5 text-xs font-medium text-blue-600 dark:text-blue-400">· {inMonth}</span>}
          </p>
          <button type="button" onClick={() => shift(1)} aria-label="Next month"
            className="h-8 w-8 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">›</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {DAY_LABELS.map((label, dow) => (
            <button
              key={label} type="button" onClick={() => toggleWeekday(dow)}
              title={`Every ${DAY_NAMES[dow]} in ${monthLabel}`}
              className="h-6 text-[11px] font-semibold text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400"
            >
              {label}
            </button>
          ))}
          {Array.from({ length: firstDow }, (_, i) => <span key={`b${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const date = ymd(view.y, view.m, i + 1)
            const on   = isPicked.has(date)
            const past = date < todayKey
            return (
              <button
                key={date} type="button" onClick={() => toggle(date)} aria-pressed={on}
                aria-label={new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                className={`h-9 rounded-lg text-sm tabular-nums transition-colors ${
                  on
                    ? "bg-blue-600 text-white font-semibold"
                    : `${past ? "text-gray-300 dark:text-gray-600" : "text-gray-700 dark:text-gray-300"} hover:bg-blue-50 dark:hover:bg-blue-950/50`
                } ${date === todayKey && !on ? "ring-1 ring-inset ring-blue-400" : ""}`}
              >
                {i + 1}
              </button>
            )
          })}
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Tap each day on the calendar. Tap a weekday letter to pick every one of those days in the month.
        </p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
              {sorted.length} date{sorted.length !== 1 ? "s" : ""} picked
              {(usualTime || usualEnd) && <span className="font-normal text-gray-400 dark:text-gray-500"> · change a time just for that date</span>}
            </p>
            <button type="button" onClick={() => onChange([])} className="text-xs text-gray-400 hover:text-red-500 hover:underline">
              Clear all
            </button>
          </div>
          {sorted.map((p) => (
            <div key={p.date} className="flex items-center gap-x-2 gap-y-1 flex-wrap">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300 w-full @sm:w-24 shrink-0">
                {new Date(p.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </span>
              <input
                type="time" aria-label="Start time"
                value={p.time ?? usualTime}
                onChange={(e) => setTime(p.date, "time", e.target.value)}
                className={timeCls(p.time !== null)}
              />
              <span className="text-xs text-gray-400">–</span>
              <input
                type="time" aria-label="End time"
                value={p.end_time ?? usualEnd}
                onChange={(e) => setTime(p.date, "end_time", e.target.value)}
                className={timeCls(p.end_time !== null)}
              />
              <button
                type="button" onClick={() => toggle(p.date)} aria-label="Remove date"
                className="h-7 w-7 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── AdminSeriesGroup ──────────────────────────────────────────────────────────

function AdminSeriesGroup({
  sessions, players, teams, expandedId, onToggleExpand, onEdit, onDuplicate, onDelete,
  onDuplicateSeries, onDeleteSeries,
  onSignupAdded, onSignupRemoved, onSignupPaidToggled, onAttendanceChanged, onBulkUpdated,
}: {
  sessions:        TrainingSession[]
  players:         PlayerOption[]
  teams:           TeamOption[]
  expandedId:      string | null
  onToggleExpand:  (id: string) => void
  onEdit:          (s: TrainingSession) => void
  onDuplicate:     (s: TrainingSession) => void
  onDelete:        (id: string) => void
  onDuplicateSeries: () => void
  onDeleteSeries:    () => void
  onSignupAdded:       (sessionId: string, signup: TrainingSession["signups"][0]) => void
  onSignupRemoved:     (sessionId: string, signupId: string) => void
  onSignupPaidToggled: (sessionId: string, signupId: string, paid: boolean) => void
  onAttendanceChanged: (sessionId: string, signupId: string, attending: boolean) => void
  onBulkUpdated:       (sessionIds: string[], data: Partial<BulkSessionUpdateData>) => void
}) {
  // Standalone sessions start open so they're immediately visible
  const [open, setOpen]               = useState(sessions.length === 1)
  const [showBulkEdit, setShowBulkEdit] = useState(false)
  const title           = sessions[0].title
  const count           = sessions.length
  const firstDate       = sessions[0].session_date
  const lastDate        = sessions[sessions.length - 1].session_date
  const upcomingInGroup = sessions.filter((s) => !isPast(s.session_date)).length

  const subtitle = count === 1
    ? fmtDate(firstDate)
    : `${count} sessions · ${fmtShortDate(firstDate)} – ${fmtShortDate(lastDate)}`

  // Gather meta for subtitle: day-named times, location, cost, eligibility
  const firstSession = sessions[0]

  // "Tuesdays 5:30 PM" for a weekly series; just the time(s) for hand-picked dates.
  const dayTimesDisplay = seriesTimesSummary(sessions)

  const locationLabel    = firstSession.location
    ? firstSession.location + (firstSession.location_address ? `, ${firstSession.location_address}` : "")
    : null
  const isPackage        = firstSession.package_only && !!firstSession.series_id
  const costLabel        = isPackage
    ? packageSummary(firstSession.package_price, count)
    : firstSession.payment_amount ? `${firstSession.payment_amount}/session` : null
  const locationCostMeta = [locationLabel, costLabel].filter(Boolean).join(" · ")

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center px-4 py-3 bg-gray-50 dark:bg-gray-800/60">
        {/* Clickable title area */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 min-w-0 text-left"
        >
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
            {isPackage && (
              <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                Whole series
              </span>
            )}
            {firstSession.eligibility_rules && (
              <span className="text-xs text-blue-600 dark:text-blue-400">{describeRules(firstSession.eligibility_rules)}</span>
            )}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 space-y-0.5">
            <div>
              {subtitle}
              {count > 1 && upcomingInGroup < count && ` · ${upcomingInGroup} upcoming`}
            </div>
            {dayTimesDisplay && <div>{dayTimesDisplay}</div>}
            {locationCostMeta && <div>{locationCostMeta}</div>}
          </div>
        </button>
        {/* Series-level actions */}
        <div className="flex items-center gap-2 shrink-0 ml-3">
          {sessions.length > 1 && (
            <button
              type="button"
              onClick={() => { setShowBulkEdit((v) => !v); setOpen(true) }}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
            >
              Edit all
            </button>
          )}
          <button
            type="button"
            onClick={onDuplicateSeries}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={onDeleteSeries}
            className="text-xs text-red-500 hover:underline"
          >
            Delete all
          </button>
          <span className="text-gray-400 dark:text-gray-500 text-sm ml-1">{open ? "▾" : "▸"}</span>
        </div>
      </div>

      {open && (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {showBulkEdit && sessions.length > 1 && (
            <BulkEditPanel
              sessions={sessions}
              teams={teams}
              onClose={() => setShowBulkEdit(false)}
              onUpdated={(data) => {
                onBulkUpdated(sessions.map((s) => s.id), data)
                setShowBulkEdit(false)
              }}
            />
          )}
          {isPackage && (
            <SeriesRosterPanel
              sessions={sessions}
              onSignupRemoved={onSignupRemoved}
              onSignupPaidToggled={onSignupPaidToggled}
            />
          )}
          {sessions.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              isPackage={isPackage}
              players={players}
              expanded={expandedId === s.id}
              onToggleExpand={() => onToggleExpand(s.id)}
              onEdit={() => onEdit(s)}
              onDuplicate={() => onDuplicate(s)}
              onDelete={() => onDelete(s.id)}
              onSignupAdded={(su) => onSignupAdded(s.id, su)}
              onSignupRemoved={(suId) => onSignupRemoved(s.id, suId)}
              onSignupPaidToggled={(suId, paid) => onSignupPaidToggled(s.id, suId, paid)}
              onAttendanceChanged={(suId, attending) => onAttendanceChanged(s.id, suId, attending)}
            />
          ))}
          {sessions.length > 1 && (
            <BulkAddPanel
              sessions={sessions}
              players={players}
              isPackage={isPackage}
              onSignupAdded={onSignupAdded}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── SeriesRosterPanel ─────────────────────────────────────────────────────────
// Whole-series package: who's registered, paid for the series, and remove from
// every date at once. (Each date's own list below is for attendance.)

function SeriesRosterPanel({
  sessions, onSignupRemoved, onSignupPaidToggled,
}: {
  sessions:            TrainingSession[]
  onSignupRemoved:     (sessionId: string, signupId: string) => void
  onSignupPaidToggled: (sessionId: string, signupId: string, paid: boolean) => void
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const roster = useMemo(() => {
    const map = new Map<string, {
      playerId: string
      first:    string
      last:     string
      parent:   string | null
      signups:  Array<{ sessionId: string; id: string; paid: boolean; attending: boolean }>
    }>()
    for (const s of sessions) {
      for (const su of s.signups) {
        let r = map.get(su.player_id)
        if (!r) {
          r = { playerId: su.player_id, first: su.players?.first_name ?? "Unknown", last: su.players?.last_name ?? "player", parent: null, signups: [] }
          map.set(su.player_id, r)
        }
        if (!r.parent && su.parents) r.parent = `${su.parents.first_name} ${su.parents.last_name}`
        r.signups.push({ sessionId: s.id, id: su.id, paid: su.paid, attending: su.attending !== false })
      }
    }
    return [...map.values()].sort((a, b) => a.last.localeCompare(b.last) || a.first.localeCompare(b.first))
  }, [sessions])

  const upcoming  = sessions.filter((s) => !isPast(s.session_date))
  const spotsLeft = upcoming.length ? Math.max(0, Math.min(...upcoming.map((s) => s.max_players - s.signups.length))) : null
  const price     = fmtPackagePrice(sessions[0].package_price)
  const unpaid    = roster.filter((r) => !r.signups.every((x) => x.paid)).length

  function togglePaid(r: (typeof roster)[number]) {
    const paid = !r.signups.every((x) => x.paid)
    setError(null)
    start(async () => {
      const result = await markTrainingSignupsPaid(r.signups.map((x) => x.id), paid)
      if (result.error) { setError(result.error); return }
      for (const x of r.signups) onSignupPaidToggled(x.sessionId, x.id, paid)
    })
  }

  function remove(r: (typeof roster)[number]) {
    const n = r.signups.length
    if (!confirm(`Take ${r.first} ${r.last} off ${n === 1 ? "this series" : `all ${n} sessions`}?`)) return
    setError(null)
    start(async () => {
      const result = await adminRemoveTrainingSignups(r.signups.map((x) => x.id))
      if (result.error) { setError(result.error); return }
      for (const x of r.signups) onSignupRemoved(x.sessionId, x.id)
    })
  }

  return (
    <div className="px-4 py-3 bg-blue-50/40 dark:bg-blue-950/20">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
          Registered for the series · {roster.length}
          {spotsLeft !== null && (
            <span className={`font-medium ${spotsLeft === 0 ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
              {" "}· {spotsLeft === 0 ? "Full" : `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""} left`}
            </span>
          )}
        </p>
        {unpaid > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {unpaid} unpaid{price ? ` · ${price} each` : ""}
          </p>
        )}
      </div>

      {roster.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">No one has registered yet.</p>
      ) : (
        <div className="space-y-1.5">
          {roster.map((r) => {
            const paid = r.signups.every((x) => x.paid)
            return (
              <div key={r.playerId} className="flex items-center justify-between gap-3">
                <p className="text-xs text-gray-700 dark:text-gray-300 min-w-0">
                  {r.first} {r.last}
                  {r.parent && <span className="text-gray-400 dark:text-gray-500"> ({r.parent})</span>}
                  {r.signups.length < sessions.length && (
                    <span className="ml-2 text-amber-600 dark:text-amber-400">
                      in {r.signups.length} of {sessions.length}
                    </span>
                  )}
                  {r.signups.some((x) => !x.attending) && (
                    <span className="ml-2 text-gray-500 dark:text-gray-400">
                      can’t make {r.signups.filter((x) => !x.attending).length}
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => togglePaid(r)}
                    disabled={pending}
                    className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors disabled:opacity-40 ${
                      paid
                        ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                        : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 hover:bg-amber-100 hover:text-amber-700 dark:hover:bg-amber-900/40 dark:hover:text-amber-400"
                    }`}
                  >
                    {paid ? "Paid" : "Unpaid"}
                  </button>
                  <button
                    onClick={() => remove(r)}
                    disabled={pending}
                    className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
    </div>
  )
}

// ── SessionCard ───────────────────────────────────────────────────────────────

function SessionCard({
  session, isPackage, players, expanded, onToggleExpand, onEdit, onDuplicate, onDelete,
  onSignupAdded, onSignupRemoved, onSignupPaidToggled, onAttendanceChanged,
}: {
  session:         TrainingSession
  isPackage:       boolean
  players:         PlayerOption[]
  expanded:        boolean
  onToggleExpand:  () => void
  onEdit:          () => void
  onDuplicate:     () => void
  onDelete:        () => void
  onSignupAdded:       (signup: TrainingSession["signups"][0]) => void
  onSignupRemoved:     (signupId: string) => void
  onSignupPaidToggled: (signupId: string, paid: boolean) => void
  onAttendanceChanged: (signupId: string, attending: boolean) => void
}) {
  const time      = fmtTime(session.session_time)
  const endTime   = fmtTime(session.session_end_time)
  const openSlots = session.max_players - session.signups.length
  const isFull    = openSlots <= 0
  const outCount  = isPackage ? session.signups.filter((su) => su.attending === false).length : 0

  return (
    <div className={`px-4 py-3 ${isPast(session.session_date) ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex-1 min-w-0 text-left"
        >
          {/* Date + time */}
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 dark:text-white text-sm">
              {fmtDate(session.session_date)}
            </span>
            {time && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {time}{endTime ? ` – ${endTime}` : ""}
              </span>
            )}
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
            {session.location && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {session.location}
                {session.location_address && ` · ${session.location_address}`}
              </span>
            )}
            <span className={`text-xs font-medium ${isFull ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
              {session.signups.length}/{session.max_players} signed up
            </span>
            {outCount > 0 && (
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                {outCount} can’t make it · {session.signups.length - outCount} coming
              </span>
            )}
            {session.payment_amount && (
              <span className="text-xs text-gray-500 dark:text-gray-400">{session.payment_amount}</span>
            )}
          </div>

        </button>

        <div className="flex items-center gap-3 shrink-0 text-xs">
          <button onClick={onEdit} className="text-blue-600 dark:text-blue-400 hover:underline">
            Edit
          </button>
          <button onClick={onDuplicate} className="text-gray-500 dark:text-gray-400 hover:underline">
            Duplicate
          </button>
          <button onClick={onDelete} className="text-red-500 hover:underline">
            Delete
          </button>
        </div>
      </div>

      {/* Expanded: signups + add player */}
      {expanded && (
        <SignupsPanel
          session={session}
          isPackage={isPackage}
          players={players}
          onSignupAdded={onSignupAdded}
          onSignupRemoved={onSignupRemoved}
          onSignupPaidToggled={onSignupPaidToggled}
          onAttendanceChanged={onAttendanceChanged}
        />
      )}
    </div>
  )
}

// ── SignupsPanel ──────────────────────────────────────────────────────────────

function SignupsPanel({
  session, isPackage, players, onSignupAdded, onSignupRemoved, onSignupPaidToggled, onAttendanceChanged,
}: {
  session:             TrainingSession
  /** Paid is tracked for the whole series (in the roster above), not per date. */
  isPackage:           boolean
  players:             PlayerOption[]
  onSignupAdded:       (signup: TrainingSession["signups"][0]) => void
  onSignupRemoved:     (signupId: string) => void
  onSignupPaidToggled: (signupId: string, paid: boolean) => void
  onAttendanceChanged: (signupId: string, attending: boolean) => void
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState("")
  const [addError, setAddError]                 = useState<string | null>(null)
  const [pending, start]                        = useTransition()

  const signedUpPlayerIds = new Set(session.signups.map((su) => su.player_id))
  const isFull        = session.signups.length >= session.max_players
  const available     = players.filter((p) => !signedUpPlayerIds.has(p.id))
  const unpaidCount   = session.signups.filter((su) => !su.paid).length

  function handleAdd() {
    if (!selectedPlayerId) return
    setAddError(null)
    start(async () => {
      const result = await adminAddTrainingSignup(session.id, selectedPlayerId)
      if (result.error) { setAddError(result.error); return }
      const player = players.find((p) => p.id === selectedPlayerId)
      onSignupAdded({
        id:             result.signupId!,
        player_id:      selectedPlayerId,
        payment_method: null,
        paid:           false,
        players:        player ? { first_name: player.first_name, last_name: player.last_name } : null,
        parents:        null,
      })
      setSelectedPlayerId("")
    })
  }

  function handleRemove(signupId: string) {
    start(async () => {
      const result = await adminRemoveTrainingSignup(signupId)
      if (!result.error) onSignupRemoved(signupId)
    })
  }

  function handleToggleAttending(signupId: string, attending: boolean) {
    setAddError(null)
    start(async () => {
      const result = await setTrainingAttendance([signupId], attending)
      if (result.error) setAddError(result.error)
      else onAttendanceChanged(signupId, attending)
    })
  }

  function handleTogglePaid(signupId: string, currentPaid: boolean) {
    start(async () => {
      const result = await markTrainingSignupPaid(signupId, !currentPaid)
      if (!result.error) onSignupPaidToggled(signupId, !currentPaid)
    })
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-3">
      {/* Signup list */}
      {session.signups.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">No signups yet.</p>
      ) : (
        <div className="space-y-1.5">
          {session.payment_amount && unpaidCount > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {unpaidCount} unpaid · {session.payment_amount} each
            </p>
          )}
          {session.signups.map((su) => {
            const player = su.players
              ? `${su.players.first_name} ${su.players.last_name}`
              : "Unknown player"
            const parent = su.parents
              ? ` (${su.parents.first_name} ${su.parents.last_name})`
              : ""
            return (
              <div key={su.id} className="flex items-center justify-between gap-3">
                <p className={`text-xs min-w-0 ${isPackage && su.attending === false ? "text-gray-400 dark:text-gray-500" : "text-gray-700 dark:text-gray-300"}`}>
                  {player}
                  <span className="text-gray-400 dark:text-gray-500">{parent}</span>
                  {su.payment_method && (
                    <span className="ml-2 text-gray-400 dark:text-gray-500">· {su.payment_method}</span>
                  )}
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  {isPackage && (
                    <button
                      onClick={() => handleToggleAttending(su.id, su.attending === false)}
                      disabled={pending}
                      title={su.attending === false ? "Marked as missing this date — tap to mark coming" : "Tap to mark as missing this date"}
                      className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors disabled:opacity-40 ${
                        su.attending === false
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                          : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                      }`}
                    >
                      {su.attending === false ? "Can’t make it" : "Coming"}
                    </button>
                  )}
                  {!isPackage && <button
                    onClick={() => handleTogglePaid(su.id, su.paid)}
                    disabled={pending}
                    className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors disabled:opacity-40 ${
                      su.paid
                        ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                        : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 hover:bg-amber-100 hover:text-amber-700 dark:hover:bg-amber-900/40 dark:hover:text-amber-400"
                    }`}
                  >
                    {su.paid ? "Paid" : "Unpaid"}
                  </button>}
                  <button
                    onClick={() => handleRemove(su.id)}
                    disabled={pending}
                    className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add player */}
      {available.length > 0 && !isFull && (
        <div className="flex items-center gap-2 pt-1">
          <select
            value={selectedPlayerId}
            onChange={(e) => setSelectedPlayerId(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Add a player…</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.first_name} {p.last_name}
              </option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={!selectedPlayerId || pending}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shrink-0"
          >
            {pending ? "Adding…" : "Add"}
          </button>
        </div>
      )}
      {isFull && (
        <p className="text-xs text-amber-600 dark:text-amber-400">Session is full ({session.max_players}/{session.max_players})</p>
      )}
      {addError && <p className="text-xs text-red-500">{addError}</p>}
    </div>
  )
}

// ── BulkAddPanel ──────────────────────────────────────────────────────────────

function BulkAddPanel({
  sessions, players, isPackage, onSignupAdded,
}: {
  sessions:      TrainingSession[]
  players:       PlayerOption[]
  isPackage:     boolean
  onSignupAdded: (sessionId: string, signup: TrainingSession["signups"][0]) => void
}) {
  const [playerId, setPlayerId] = useState("")
  const [status, setStatus]     = useState<string | null>(null)
  const [pending, start]        = useTransition()

  // Players already in every session are excluded from the dropdown
  const fullyRegisteredIds = new Set(
    players
      .filter((p) => sessions.every((s) => s.signups.some((su) => su.player_id === p.id)))
      .map((p) => p.id)
  )
  const available = players.filter((p) => !fullyRegisteredIds.has(p.id))

  if (available.length === 0) return null

  function handleBulkAdd() {
    if (!playerId) return
    setStatus(null)
    start(async () => {
      const result = await adminBulkAddPlayerToSessions(sessions.map((s) => s.id), playerId)
      if (result.error) { setStatus(result.error); return }
      const player = players.find((p) => p.id === playerId)
      for (const r of result.added) {
        onSignupAdded(r.sessionId, {
          id:             r.signupId,
          player_id:      playerId,
          payment_method: null,
          paid:           false,
          players:        player ? { first_name: player.first_name, last_name: player.last_name } : null,
          parents:        null,
        })
      }
      const n       = result.added.length
      const skipped = sessions.length - n
      setStatus(
        n === 0
          ? "Already registered in all sessions or sessions full"
          : `Added to ${n} session${n !== 1 ? "s" : ""}${skipped > 0 ? ` · ${skipped} skipped (already registered or full)` : ""}`
      )
      setPlayerId("")
    })
  }

  return (
    <div className="px-4 py-3 bg-blue-50/40 dark:bg-blue-950/20 border-t border-blue-100 dark:border-blue-900">
      <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
        {isPackage ? "Register a player for the whole series" : "Add to all sessions"}
      </p>
      <div className="flex items-center gap-2">
        <select
          value={playerId}
          onChange={(e) => { setPlayerId(e.target.value); setStatus(null) }}
          className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Select player…</option>
          {available.map((p) => (
            <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
          ))}
        </select>
        <button
          onClick={handleBulkAdd}
          disabled={!playerId || pending}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shrink-0"
        >
          {pending ? "Adding…" : isPackage ? "Register" : "Add to all"}
        </button>
      </div>
      {status && (
        <p className={`text-xs mt-1.5 ${status.startsWith("Added") ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
          {status}
        </p>
      )}
    </div>
  )
}

// ── BulkEditPanel ─────────────────────────────────────────────────────────────

function BulkEditPanel({
  sessions, teams, onClose, onUpdated,
}: {
  sessions:   TrainingSession[]
  teams:      TeamOption[]
  onClose:    () => void
  onUpdated:  (data: Partial<BulkSessionUpdateData>) => void
}) {
  const first = sessions[0]
  const [form, setForm] = useState<BulkFormState>({
    title:             first.title,
    description:       first.description      ?? "",
    location:          first.location         ?? "",
    location_address:  first.location_address ?? "",
    image_url:         first.image_url        ?? "",
    session_time:      first.session_time     ?? "",
    session_end_time:  first.session_end_time ?? "",
    max_players:       String(first.max_players),
    payment_amount:    first.payment_amount   ?? "",
    payment_methods:   first.payment_methods  ?? [],
    notes:             first.notes            ?? "",
    eligibility_rules: first.eligibility_rules,
    package_only:      first.package_only,
    package_price:     first.package_price    ?? "",
  })
  const [enabled, setEnabled] = useState<Record<BulkFieldKey, boolean>>({} as Record<BulkFieldKey, boolean>)
  const [error, setError]   = useState<string | null>(null)
  const [pending, start]    = useTransition()
  const [imageUploading, setImgUpload] = useState(false)

  const on = (k: BulkFieldKey) => !!enabled[k]
  const toggle = (k: BulkFieldKey) => setEnabled((e) => ({ ...e, [k]: !e[k] }))
  const FIELD_ORDER: BulkFieldKey[] = [
    "title", "time", "location", "image", "max_players",
    "payment_amount", "package", "payment_methods", "description", "notes", "eligibility_rules",
  ]
  const changed = FIELD_ORDER.filter(on)

  const inputCls = "w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImgUpload(true)
    const supabase = createClient()
    const ext  = file.name.split(".").pop() ?? "jpg"
    const path = `sessions/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from("training-images").upload(path, file)
    if (!upErr) {
      const { data: urlData } = supabase.storage.from("training-images").getPublicUrl(path)
      setForm((f) => ({ ...f, image_url: urlData.publicUrl }))
    }
    setImgUpload(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const data = buildBulkPartial(form, on)
    if (Object.keys(data).length === 0) { setError("Tick at least one field to change."); return }
    if (on("title") && !form.title.trim()) { setError("Title can't be blank."); return }
    start(async () => {
      const result = await adminBulkUpdateSessions(sessions.map((s) => s.id), data)
      if (result.error) { setError(result.error); return }
      onUpdated(data)
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="px-4 py-4 bg-amber-50/40 dark:bg-amber-950/20 border-b border-amber-100 dark:border-amber-900 space-y-3"
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
          Edit all {sessions.length} sessions
        </p>
        <button type="button" onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          Cancel
        </button>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Tick only the fields you want to change. Anything you leave unticked keeps each session&rsquo;s own value — times, photos, and everything else stay exactly as they are.
      </p>

      {/* Field picker — only ticked fields are edited & applied */}
      <div className="flex flex-wrap gap-1.5">
        {FIELD_ORDER.map((k) => (
          <button
            key={k} type="button" onClick={() => toggle(k)}
            className={`text-xs rounded-full px-3 py-1 border transition-colors ${
              on(k)
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400"
            }`}
          >
            {on(k) ? "✓ " : ""}{BULK_FIELD_LABELS[k]}
          </button>
        ))}
      </div>

      {on("title") && (
      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Title *</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          className={inputCls}
        />
      </div>
      )}

      {on("description") && (
      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Description</label>
        <textarea
          rows={2}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className={`${inputCls} resize-none`}
        />
      </div>
      )}

      {on("time") && (<>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Start time</label>
          <input
            type="time"
            value={form.session_time}
            onChange={(e) => setForm((f) => ({ ...f, session_time: e.target.value }))}
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">End time</label>
          <input
            type="time"
            value={form.session_end_time}
            onChange={(e) => setForm((f) => ({ ...f, session_end_time: e.target.value }))}
            className={inputCls}
          />
        </div>
      </div>
      {form.session_time && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 dark:text-gray-500">Duration:</span>
          {DURATION_SHORTCUTS.map((mins) => (
            <button
              key={mins} type="button"
              onClick={() => setForm((f) => ({ ...f, session_end_time: addMinutes(f.session_time, mins) }))}
              className="text-xs rounded-full px-2.5 py-0.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              {mins} min
            </button>
          ))}
        </div>
      )}
      </>)}

      {on("location") && (<>
      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Location name</label>
        <input
          type="text" placeholder="e.g. Dobson Park"
          value={form.location}
          onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          className={inputCls}
        />
      </div>
      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Location address</label>
        <input
          type="text" placeholder="e.g. 100 E Dobson Rd, Mesa, AZ"
          value={form.location_address}
          onChange={(e) => setForm((f) => ({ ...f, location_address: e.target.value }))}
          className={inputCls}
        />
      </div>
      </>)}

      {on("max_players") && (
      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Max players</label>
        <input
          type="number" min={1} max={100}
          value={form.max_players}
          onChange={(e) => setForm((f) => ({ ...f, max_players: e.target.value }))}
          className={inputCls}
        />
      </div>
      )}

      {on("payment_amount") && (
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Price</label>
          <input
            type="text" placeholder="e.g. $20"
            value={form.payment_amount}
            onChange={(e) => setForm((f) => ({ ...f, payment_amount: e.target.value }))}
            className={inputCls}
          />
        </div>
      )}

      {on("package") && (
        <div className="space-y-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.package_only}
              onChange={(e) => setForm((f) => ({ ...f, package_only: e.target.checked }))}
              className="accent-blue-600 mt-0.5"
            />
            <span className="text-sm text-gray-800 dark:text-gray-200">
              Parents sign up for the whole series
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                One registration covers all {sessions.length} sessions at one price. Parents can’t pick single dates.
              </span>
            </span>
          </label>
          {form.package_only && (
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Price for all {sessions.length} sessions</label>
              <input
                type="text" placeholder="e.g. $75"
                value={form.package_price}
                onChange={(e) => setForm((f) => ({ ...f, package_price: e.target.value }))}
                className={inputCls}
              />
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                Replaces the per-session price. Kids already signed up for some dates keep those dates.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Payment methods */}
      {on("payment_methods") && (
      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1.5">Payment methods</label>
        <div className="space-y-2">
          {form.payment_methods.map((pm, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text" placeholder="Label"
                value={pm.label}
                onChange={(e) => {
                  const updated = [...form.payment_methods]
                  updated[i] = { ...pm, label: e.target.value }
                  setForm((f) => ({ ...f, payment_methods: updated }))
                }}
                className="w-32 rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <input
                type="url" placeholder="Link (optional)"
                value={pm.link ?? ""}
                onChange={(e) => {
                  const updated = [...form.payment_methods]
                  updated[i] = { ...pm, link: e.target.value || null }
                  setForm((f) => ({ ...f, payment_methods: updated }))
                }}
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, payment_methods: f.payment_methods.filter((_, idx) => idx !== i) }))}
                className="text-red-400 hover:text-red-600 text-base shrink-0"
              >
                ×
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-0.5">
            {PRESET_PAYMENTS.map((preset) => {
              const alreadyAdded = form.payment_methods.some((pm) => pm.label === preset.label)
              return (
                <button
                  key={preset.label} type="button"
                  disabled={alreadyAdded}
                  onClick={() => setForm((f) => ({ ...f, payment_methods: [...f.payment_methods, preset] }))}
                  className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                    alreadyAdded
                      ? "border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600 cursor-default"
                      : "border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950"
                  }`}
                >
                  + {preset.label}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, payment_methods: [...f.payment_methods, { label: "", link: null }] }))}
              className="text-xs text-gray-400 dark:text-gray-500 hover:underline"
            >
              + Custom
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Eligibility */}
      {on("eligibility_rules") && (
      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1.5">Eligibility</label>
        <RuleBuilder
          value={form.eligibility_rules}
          onChange={(v) => setForm((f) => ({ ...f, eligibility_rules: v }))}
          teams={teams}
        />
      </div>
      )}

      {/* Notes */}
      {on("notes") && (
      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Notes</label>
        <input
          type="text" placeholder="Optional"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          className={inputCls}
        />
      </div>
      )}

      {/* Image */}
      {on("image") && (
      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1.5">Photo</label>
        {form.image_url ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={form.image_url} alt="" className="h-20 w-32 object-cover rounded-lg border border-gray-200 dark:border-gray-700" />
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, image_url: "" }))}
              className="text-xs text-red-500 hover:underline"
            >
              Remove
            </button>
          </div>
        ) : (
          <label className="cursor-pointer inline-flex items-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            {imageUploading ? "Uploading…" : "Upload photo"}
            <input
              type="file" accept="image/*"
              className="hidden"
              disabled={imageUploading}
              onChange={handleImageUpload}
            />
          </label>
        )}
      </div>
      )}

      {/* What will change — explicit before applying */}
      {changed.length > 0 ? (
        <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/30 px-3 py-2 text-xs text-blue-800 dark:text-blue-200">
          All <strong>{sessions.length}</strong> sessions will be set to the same{" "}
          <strong>{changed.map((k) => BULK_FIELD_LABELS[k]).join(", ")}</strong>. Every other field stays as each
          session has it.
        </div>
      ) : (
        <p className="text-xs text-gray-400 dark:text-gray-500">Tick a field above to change it for all {sessions.length} sessions.</p>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending || changed.length === 0}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {pending ? "Saving…" : changed.length === 0 ? "Pick fields to change" : `Apply to ${sessions.length} sessions`}
        </button>
        <button type="button" onClick={onClose}
          className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
          Cancel
        </button>
      </div>
    </form>
  )
}
