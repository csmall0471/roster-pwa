"use client"

import { useState, useTransition } from "react"
import { createTrainingSession, updateTrainingSession, deleteTrainingSession } from "../actions"
import type { SessionData } from "../actions"
import type { EligibilityRules } from "@/lib/training-eligibility"
import { describeRules } from "@/lib/training-eligibility"
import RuleBuilder, { type TeamOption } from "./RuleBuilder"

// ── Types ─────────────────────────────────────────────────────────────────────

export type TrainingSession = {
  id:                string
  title:             string
  description:       string | null
  location:          string | null
  session_date:      string
  session_time:      string | null
  max_players:       number
  payment_link:      string | null
  payment_amount:    string | null
  eligibility_rules: EligibilityRules
  notes:             string | null
  signups: Array<{
    id:      string
    players: { first_name: string; last_name: string } | null
    parents: { first_name: string; last_name: string } | null
  }>
}

type FormState = {
  title:          string
  description:    string
  location:       string
  session_date:   string
  session_time:   string
  max_players:    string
  payment_amount: string
  payment_link:   string
  notes:          string
  eligibility_rules: EligibilityRules
}

const EMPTY_FORM: FormState = {
  title: "", description: "", location: "", session_date: "", session_time: "",
  max_players: "10", payment_amount: "", payment_link: "", notes: "",
  eligibility_rules: null,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  })
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
  initialSessions, teams,
}: {
  initialSessions: TrainingSession[]
  teams: TeamOption[]
}) {
  const [sessions, setSessions] = useState(initialSessions)
  const [adding, setAdding]     = useState(false)
  const [editingId, setEditId]  = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [form, setForm]         = useState<FormState>(EMPTY_FORM)
  const [error, setError]       = useState<string | null>(null)
  const [pending, start]        = useTransition()

  const upcoming = sessions.filter((s) => !isPast(s.session_date))
  const past     = sessions.filter((s) =>  isPast(s.session_date))

  function openAdd() {
    setForm(EMPTY_FORM)
    setEditId(null)
    setAdding(true)
    setError(null)
  }

  function openEdit(s: TrainingSession) {
    setForm({
      title:             s.title,
      description:       s.description ?? "",
      location:          s.location    ?? "",
      session_date:      s.session_date,
      session_time:      s.session_time ?? "",
      max_players:       String(s.max_players),
      payment_amount:    s.payment_amount ?? "",
      payment_link:      s.payment_link   ?? "",
      notes:             s.notes          ?? "",
      eligibility_rules: s.eligibility_rules,
    })
    setEditId(s.id)
    setAdding(false)
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
      description:       form.description    || null,
      location:          form.location       || null,
      session_date:      form.session_date,
      session_time:      form.session_time   || null,
      max_players:       Math.max(1, parseInt(form.max_players) || 10),
      payment_amount:    form.payment_amount || null,
      payment_link:      form.payment_link   || null,
      eligibility_rules: form.eligibility_rules,
      notes:             form.notes          || null,
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title || !form.session_date) return
    setError(null)
    const data = toData()

    start(async () => {
      if (editingId) {
        const result = await updateTrainingSession(editingId, data)
        if (result.error) { setError(result.error); return }
        setSessions((prev) =>
          prev.map((s) => s.id === editingId ? { ...s, ...data } : s)
        )
      } else {
        const result = await createTrainingSession(data)
        if (result.error) { setError(result.error); return }
        setSessions((prev) =>
          [...prev, { id: result.id!, ...data, signups: [] }]
            .sort((a, b) => a.session_date.localeCompare(b.session_date))
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

  const inputCls = "w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {sessions.length === 0
            ? "No sessions yet"
            : `${upcoming.length} upcoming · ${past.length} past`}
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

          {/* Date + time + location */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Date *</label>
              <input
                type="date" required
                value={form.session_date}
                onChange={(e) => setForm((f) => ({ ...f, session_date: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Time</label>
              <input
                type="time"
                value={form.session_time}
                onChange={(e) => setForm((f) => ({ ...f, session_time: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Location</label>
            <input
              type="text" placeholder="e.g. Dobson Park"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              className={inputCls}
            />
          </div>

          {/* Max players + payment */}
          <div className="grid grid-cols-3 gap-3">
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
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Payment link</label>
              <input
                type="url" placeholder="Venmo / Zelle / etc."
                value={form.payment_link}
                onChange={(e) => setForm((f) => ({ ...f, payment_link: e.target.value }))}
                className={inputCls}
              />
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

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={pending || !form.title || !form.session_date}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {pending ? "Saving…" : editingId ? "Save changes" : "Create session"}
            </button>
            <button type="button" onClick={closeForm}
              className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Upcoming sessions */}
      {upcoming.length > 0 && (
        <div className="space-y-2">
          {upcoming.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              expanded={expandedId === s.id}
              onToggleExpand={() => setExpandedId((v) => v === s.id ? null : s.id)}
              onEdit={() => openEdit(s)}
              onDelete={() => handleDelete(s.id)}
              dimmed={false}
            />
          ))}
        </div>
      )}

      {/* Past sessions */}
      {past.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
            Past sessions
          </p>
          <div className="space-y-2 opacity-50">
            {[...past].reverse().map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                expanded={expandedId === s.id}
                onToggleExpand={() => setExpandedId((v) => v === s.id ? null : s.id)}
                onEdit={() => openEdit(s)}
                onDelete={() => handleDelete(s.id)}
                dimmed
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

// ── SessionCard ───────────────────────────────────────────────────────────────

function SessionCard({
  session, expanded, onToggleExpand, onEdit, onDelete, dimmed,
}: {
  session:        TrainingSession
  expanded:       boolean
  onToggleExpand: () => void
  onEdit:         () => void
  onDelete:       () => void
  dimmed:         boolean
}) {
  const time      = fmtTime(session.session_time)
  const openSlots = session.max_players - session.signups.length
  const isFull    = openSlots <= 0

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3">
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
            {time && <span className="text-xs text-gray-400 dark:text-gray-500">{time}</span>}
          </div>

          {/* Title */}
          <p className="text-sm text-gray-800 dark:text-gray-200 font-medium mt-0.5">
            {session.title}
          </p>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
            {session.location && (
              <span className="text-xs text-gray-500 dark:text-gray-400">{session.location}</span>
            )}
            <span className={`text-xs font-medium ${isFull ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
              {session.signups.length}/{session.max_players} signed up
            </span>
            {session.payment_amount && (
              <span className="text-xs text-gray-500 dark:text-gray-400">{session.payment_amount}</span>
            )}
          </div>

          {/* Eligibility summary */}
          {session.eligibility_rules && (
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
              {describeRules(session.eligibility_rules)}
            </p>
          )}
        </button>

        {!dimmed && (
          <div className="flex items-center gap-3 shrink-0 text-xs">
            <button onClick={onEdit} className="text-blue-600 dark:text-blue-400 hover:underline">
              Edit
            </button>
            <button onClick={onDelete} className="text-red-500 hover:underline">
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Expanded: signups list */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          {session.signups.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">No signups yet.</p>
          ) : (
            <div className="space-y-1">
              {session.signups.map((su) => {
                const player = su.players
                  ? `${su.players.first_name} ${su.players.last_name}`
                  : "Unknown player"
                const parent = su.parents
                  ? ` (${su.parents.first_name} ${su.parents.last_name})`
                  : ""
                return (
                  <p key={su.id} className="text-xs text-gray-700 dark:text-gray-300">
                    {player}
                    <span className="text-gray-400 dark:text-gray-500">{parent}</span>
                  </p>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
