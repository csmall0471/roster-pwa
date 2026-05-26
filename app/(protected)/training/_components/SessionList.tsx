"use client"

import { useState, useTransition, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { createTrainingSession, updateTrainingSession, deleteTrainingSession, deleteTrainingSeries, adminAddTrainingSignup, adminRemoveTrainingSignup, markTrainingSignupPaid, adminBulkAddPlayerToSessions } from "../actions"
import type { SessionData, PaymentMethod, RepeatDayConfig } from "../actions"
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
  signups: Array<{
    id:             string
    player_id:      string
    payment_method: string | null
    paid:           boolean
    players: { first_name: string; last_name: string } | null
    parents: { first_name: string; last_name: string } | null
  }>
}

const DAY_LABELS  = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const DAY_NAMES   = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const DAY_PLURAL  = ["Sundays","Mondays","Tuesdays","Wednesdays","Thursdays","Fridays","Saturdays"]

const PRESET_PAYMENTS: PaymentMethod[] = [
  { label: "Venmo",       link: "https://www.venmo.com/u/Connor-Small-1" },
  { label: "Apple Pay",   link: "tel:6232563187" },
  { label: "Zelle",       link: "tel:6232563187" },
  { label: "Cash / Check", link: null },
]

type DayTime = { time: string; end_time: string }

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
}

const EMPTY_FORM: FormState = {
  title: "", description: "", location: "", location_address: "", image_url: "",
  session_date: "", session_time: "", session_end_time: "", max_players: "10",
  payment_amount: "", payment_methods: [], notes: "",
  eligibility_rules: null, repeat_weekly: false, repeat_weeks: "4",
  repeat_days: [], day_times: {}, series_id: "",
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

  function toData(): SessionData {
    return {
      title:             form.title,
      description:       form.description       || null,
      location:          form.location          || null,
      location_address:  form.location_address  || null,
      image_url:         form.image_url         || null,
      session_date:      form.session_date,
      session_time:      form.session_time      || null,
      session_end_time:  form.session_end_time  || null,
      max_players:       Math.max(1, parseInt(form.max_players) || 10),
      payment_amount:    form.payment_amount    || null,
      payment_methods:   form.payment_methods,
      eligibility_rules: form.eligibility_rules,
      notes:             form.notes             || null,
      series_id:         form.series_id         || null,
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
    if (!form.title || !form.session_date) return
    setError(null)
    const data      = toData()
    const repeatWeeks = form.repeat_weekly ? Math.max(1, parseInt(form.repeat_weeks) || 1) : 1
    const dayConfigs  = buildDayConfigs()

    start(async () => {
      if (editingId) {
        const result = await updateTrainingSession(editingId, data)
        if (result.error) { setError(result.error); return }
        setSessions((prev) =>
          prev.map((s) => s.id === editingId ? { ...s, ...data } : s)
        )
      } else {
        const result = await createTrainingSession(data, repeatWeeks, dayConfigs)
        if (result.error) { setError(result.error); return }
        const dates  = generateSessionDates(data.session_date, repeatWeeks, dayConfigs)
        const newRows = dates.map(({ date, time, endTime }, i) => ({
          id:               result.ids[i] ?? crypto.randomUUID(),
          ...data,
          series_id:        result.seriesId,
          session_date:     date,
          session_time:     time     ?? data.session_time,
          session_end_time: endTime  ?? data.session_end_time,
          signups:          [] as TrainingSession["signups"],
        }))
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

          {/* Date + time */}
          <div className="grid grid-cols-3 gap-3">
            <div>
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
            </div>
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

          {/* Repeat weekly (only on create) */}
          {!editingId && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={form.repeat_weekly}
                    onChange={(e) => {
                      const checked = e.target.checked
                      const updates: Partial<FormState> = { repeat_weekly: checked }
                      if (checked && form.session_date && form.repeat_days.length === 0) {
                        const day = new Date(form.session_date + "T00:00:00").getDay()
                        updates.repeat_days = [day]
                        updates.day_times   = { [day]: { time: form.session_time, end_time: form.session_end_time } }
                      }
                      setForm((f) => ({ ...f, ...updates }))
                    }}
                    className="accent-blue-600"
                  />
                  Repeat weekly
                </label>
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
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Price</label>
              <input
                type="text" placeholder="e.g. $20"
                value={form.payment_amount}
                onChange={(e) => setForm((f) => ({ ...f, payment_amount: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>

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

          {/* Series — only shown for single sessions (recurring auto-creates a series) */}
          {!form.repeat_weekly && seriesOptions.length > 0 && (
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Series</label>
              <select
                value={form.series_id}
                onChange={(e) => setForm((f) => ({ ...f, series_id: e.target.value }))}
                className={inputCls}
              >
                <option value="">Standalone session</option>
                {seriesOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={pending || !form.title || !form.session_date}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {(() => {
                if (pending) return "Saving…"
                if (editingId) return "Save changes"
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

// ── AdminSeriesGroup ──────────────────────────────────────────────────────────

function AdminSeriesGroup({
  sessions, players, expandedId, onToggleExpand, onEdit, onDuplicate, onDelete,
  onDuplicateSeries, onDeleteSeries,
  onSignupAdded, onSignupRemoved, onSignupPaidToggled,
}: {
  sessions:        TrainingSession[]
  players:         PlayerOption[]
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
}) {
  // Standalone sessions start open so they're immediately visible
  const [open, setOpen] = useState(sessions.length === 1)
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

  const dayTimesDisplay = (() => {
    if (count === 1) {
      const t = fmtTime(firstSession.session_time)
      const e = fmtTime(firstSession.session_end_time)
      return t ? (e ? `${t} – ${e}` : t) : null
    }
    const map = new Map<number, string>()
    for (const s of sessions) {
      const day = new Date(s.session_date + "T00:00:00").getDay()
      if (!map.has(day)) {
        const t = fmtTime(s.session_time)
        const e = fmtTime(s.session_end_time)
        if (t) map.set(day, e ? `${t} – ${e}` : t)
      }
    }
    if (map.size === 0) return null
    return [...map.entries()]
      .sort(([a], [b]) => a - b)
      .map(([day, t]) => `${DAY_PLURAL[day]} ${t}`)
      .join(" / ")
  })()

  const locationLabel    = firstSession.location
    ? firstSession.location + (firstSession.location_address ? `, ${firstSession.location_address}` : "")
    : null
  const costLabel        = firstSession.payment_amount ? `${firstSession.payment_amount}/session` : null
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
          <div className="flex items-start gap-3">
            <span className="text-sm font-semibold text-gray-900 dark:text-white flex-1 min-w-0">{title}</span>
            {firstSession.eligibility_rules && (
              <span className="text-xs text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">{describeRules(firstSession.eligibility_rules)}</span>
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
          {sessions.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              players={players}
              expanded={expandedId === s.id}
              onToggleExpand={() => onToggleExpand(s.id)}
              onEdit={() => onEdit(s)}
              onDuplicate={() => onDuplicate(s)}
              onDelete={() => onDelete(s.id)}
              onSignupAdded={(su) => onSignupAdded(s.id, su)}
              onSignupRemoved={(suId) => onSignupRemoved(s.id, suId)}
              onSignupPaidToggled={(suId, paid) => onSignupPaidToggled(s.id, suId, paid)}
            />
          ))}
          {sessions.length > 1 && (
            <BulkAddPanel
              sessions={sessions}
              players={players}
              onSignupAdded={onSignupAdded}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── SessionCard ───────────────────────────────────────────────────────────────

function SessionCard({
  session, players, expanded, onToggleExpand, onEdit, onDuplicate, onDelete,
  onSignupAdded, onSignupRemoved, onSignupPaidToggled,
}: {
  session:         TrainingSession
  players:         PlayerOption[]
  expanded:        boolean
  onToggleExpand:  () => void
  onEdit:          () => void
  onDuplicate:     () => void
  onDelete:        () => void
  onSignupAdded:       (signup: TrainingSession["signups"][0]) => void
  onSignupRemoved:     (signupId: string) => void
  onSignupPaidToggled: (signupId: string, paid: boolean) => void
}) {
  const time      = fmtTime(session.session_time)
  const endTime   = fmtTime(session.session_end_time)
  const openSlots = session.max_players - session.signups.length
  const isFull    = openSlots <= 0

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
          players={players}
          onSignupAdded={onSignupAdded}
          onSignupRemoved={onSignupRemoved}
          onSignupPaidToggled={onSignupPaidToggled}
        />
      )}
    </div>
  )
}

// ── SignupsPanel ──────────────────────────────────────────────────────────────

function SignupsPanel({
  session, players, onSignupAdded, onSignupRemoved, onSignupPaidToggled,
}: {
  session:             TrainingSession
  players:             PlayerOption[]
  onSignupAdded:       (signup: TrainingSession["signups"][0]) => void
  onSignupRemoved:     (signupId: string) => void
  onSignupPaidToggled: (signupId: string, paid: boolean) => void
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
                <p className="text-xs text-gray-700 dark:text-gray-300 min-w-0">
                  {player}
                  <span className="text-gray-400 dark:text-gray-500">{parent}</span>
                  {su.payment_method && (
                    <span className="ml-2 text-gray-400 dark:text-gray-500">· {su.payment_method}</span>
                  )}
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleTogglePaid(su.id, su.paid)}
                    disabled={pending}
                    className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors disabled:opacity-40 ${
                      su.paid
                        ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                        : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 hover:bg-amber-100 hover:text-amber-700 dark:hover:bg-amber-900/40 dark:hover:text-amber-400"
                    }`}
                  >
                    {su.paid ? "Paid" : "Unpaid"}
                  </button>
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
  sessions, players, onSignupAdded,
}: {
  sessions:      TrainingSession[]
  players:       PlayerOption[]
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
    <div className="px-4 py-3 bg-blue-50/40 dark:bg-blue-950/20">
      <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Add to all sessions</p>
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
          {pending ? "Adding…" : "Add to all"}
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
