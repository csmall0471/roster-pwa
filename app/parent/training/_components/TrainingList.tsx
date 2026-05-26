"use client"

import { useState, useTransition, useMemo } from "react"
import { signUpForTraining, cancelTrainingSignup, bulkSignUpForTraining } from "@/app/(protected)/training/actions"
import type { PaymentMethod } from "@/app/(protected)/training/actions"

// ── Types ─────────────────────────────────────────────────────────────────────

export type EligiblePlayer = {
  player_id:      string
  first_name:     string
  last_name:      string
  signup_id:      string | null
  payment_method: string | null
  paid:           boolean
}

export type IneligiblePlayer = {
  player_id:  string
  first_name: string
  last_name:  string
  reason:     string
}

export type SignedUpPlayer = {
  first_name: string
  last_name:  string
}

export type TrainingSessionForParent = {
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
  notes:             string | null
  total_signups:     number
  series_id:         string | null
  players:           EligiblePlayer[]
  ineligiblePlayers: IneligiblePlayer[]
  signedUpPlayers:   SignedUpPlayer[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  })
}

function fmtShortDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  })
}

function fmtTime(t: string | null) {
  if (!t) return null
  const [h, m] = t.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
}

function mapsLink(location: string) {
  return `https://maps.google.com/?q=${encodeURIComponent(location)}`
}

function groupBySeries(sessions: TrainingSessionForParent[]) {
  const map = new Map<string, TrainingSessionForParent[]>()
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

// ── TrainingList ──────────────────────────────────────────────────────────────

export default function TrainingList({
  initialSessions,
}: {
  initialSessions: TrainingSessionForParent[]
}) {
  const [sessions, setSessions] = useState(initialSessions)

  function onSignup(sessionId: string, playerId: string, signupId: string) {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              total_signups: s.total_signups + 1,
              players: s.players.map((p) =>
                p.player_id === playerId ? { ...p, signup_id: signupId, paid: false } : p
              ),
            }
          : s
      )
    )
  }

  function onCancel(sessionId: string, playerId: string) {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              total_signups: s.total_signups - 1,
              players: s.players.map((p) =>
                p.player_id === playerId ? { ...p, signup_id: null } : p
              ),
            }
          : s
      )
    )
  }

  function onBulkSignup(playerId: string, results: Array<{ sessionId: string; signupId: string }>) {
    setSessions((prev) =>
      prev.map((s) => {
        const result = results.find((r) => r.sessionId === s.id)
        if (!result) return s
        return {
          ...s,
          total_signups: s.total_signups + 1,
          players: s.players.map((p) =>
            p.player_id === playerId ? { ...p, signup_id: result.signupId, paid: false } : p
          ),
        }
      })
    )
  }

  const grouped = useMemo(() => groupBySeries(sessions), [sessions])

  const unpaidTotal = useMemo(() => {
    let total = 0
    for (const s of sessions) {
      if (!s.payment_amount) continue
      const amount = parseFloat(s.payment_amount.replace(/[^0-9.]/g, ""))
      if (isNaN(amount)) continue
      for (const p of s.players) {
        if (p.signup_id && !p.paid) total += amount
      }
    }
    return total
  }, [sessions])

  return (
    <div className="space-y-3">
      {unpaidTotal > 0 && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Outstanding balance: ${unpaidTotal.toFixed(2)}
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
            Payment due for registered training sessions
          </p>
        </div>
      )}
      {Array.from(grouped.values()).map((seriesSessions) => (
        <SeriesGroup
          key={seriesSessions[0].series_id ?? seriesSessions[0].id}
          sessions={seriesSessions}
          onSignup={onSignup}
          onCancel={onCancel}
          onBulkSignup={onBulkSignup}
        />
      ))}
    </div>
  )
}

// ── SeriesGroup ───────────────────────────────────────────────────────────────

function SeriesGroup({
  sessions, onSignup, onCancel, onBulkSignup,
}: {
  sessions:     TrainingSessionForParent[]
  onSignup:     (sessionId: string, playerId: string, signupId: string) => void
  onCancel:     (sessionId: string, playerId: string) => void
  onBulkSignup: (playerId: string, results: Array<{ sessionId: string; signupId: string }>) => void
}) {
  const [open, setOpen] = useState(false)
  const title     = sessions[0].title
  const count     = sessions.length
  const firstDate = sessions[0].session_date
  const lastDate  = sessions[sessions.length - 1].session_date

  const subtitle = count === 1
    ? fmtDate(firstDate)
    : `${count} sessions · ${fmtShortDate(firstDate)} – ${fmtShortDate(lastDate)}`

  const firstSession = sessions[0]
  const uniqueTimes  = [...new Set(sessions.map((s) => {
    const t = fmtTime(s.session_time)
    const e = fmtTime(s.session_end_time)
    return t ? (e ? `${t} – ${e}` : t) : null
  }).filter(Boolean))]
  const locationLabel = firstSession.location ?? null

  // All eligible players across the entire series (deduplicated)
  const allPlayers = useMemo(() => {
    const map = new Map<string, { player_id: string; first_name: string; last_name: string }>()
    for (const s of sessions) {
      for (const p of s.players) {
        if (!map.has(p.player_id)) {
          map.set(p.player_id, { player_id: p.player_id, first_name: p.first_name, last_name: p.last_name })
        }
      }
    }
    return Array.from(map.values())
  }, [sessions])

  const ineligiblePlayers = sessions[0].ineligiblePlayers

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
      >
        <div className="min-w-0 flex-1">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 space-y-0.5">
            <div>{subtitle}</div>
            {uniqueTimes.length > 0 && <div>{uniqueTimes.join(" / ")}</div>}
            {locationLabel && <div>{locationLabel}</div>}
          </div>
        </div>
        <span className="text-gray-400 dark:text-gray-500 text-sm ml-4 shrink-0">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div>
          {/* Per-player signup/status rows */}
          {allPlayers.length > 0 && (
            <div className="divide-y divide-gray-100 dark:divide-gray-800 border-b border-gray-200 dark:border-gray-700">
              {allPlayers.map((player) => (
                <SeriesPlayerRow
                  key={player.player_id}
                  playerId={player.player_id}
                  firstName={player.first_name}
                  lastName={player.last_name}
                  sessions={sessions}
                  onSignup={(sid, signupId) => onSignup(sid, player.player_id, signupId)}
                  onCancel={(sid) => onCancel(sid, player.player_id)}
                  onBulkSignup={(results) => onBulkSignup(player.player_id, results)}
                />
              ))}
            </div>
          )}

          {/* Ineligible players right below eligible */}
          {ineligiblePlayers.length > 0 && (
            <div className="border-b border-gray-100 dark:border-gray-800">
              <IneligibleDropdown players={ineligiblePlayers} />
            </div>
          )}

          {/* Date list — info only */}
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {sessions.map((s) => (
              <SimpleDateCard key={s.id} session={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── SeriesPlayerRow ───────────────────────────────────────────────────────────

function SeriesPlayerRow({
  playerId, firstName, lastName, sessions,
  onSignup, onCancel, onBulkSignup,
}: {
  playerId:     string
  firstName:    string
  lastName:     string
  sessions:     TrainingSessionForParent[]
  onSignup:     (sessionId: string, signupId: string) => void
  onCancel:     (sessionId: string) => void
  onBulkSignup: (results: Array<{ sessionId: string; signupId: string }>) => void
}) {
  const name = `${firstName} ${lastName}`

  // Sessions where this player is eligible
  const eligibleSessions = sessions.filter((s) =>
    s.players.some((p) => p.player_id === playerId)
  )

  // Sessions they're already registered for
  const registeredSessions = eligibleSessions.filter((s) =>
    s.players.some((p) => p.player_id === playerId && p.signup_id)
  )

  // Sessions available to sign up for (eligible, not registered, not full)
  const unregisteredSessions = eligibleSessions.filter((s) =>
    s.players.some((p) => p.player_id === playerId && !p.signup_id) &&
    s.total_signups < s.max_players
  )

  const hasUnregistered = unregisteredSessions.length > 0

  const firstSession       = eligibleSessions[0]
  const paymentMethods     = firstSession?.payment_methods ?? []
  const paymentAmount      = firstSession?.payment_amount ?? null
  const needsPaymentChoice = paymentMethods.length > 0
  const needsForm          = needsPaymentChoice || unregisteredSessions.length > 1

  const [showForm, setShowForm]           = useState(false)
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set())
  const [selectedMethod, setMethod]       = useState<string | null>(null)
  const [reminderEmail, setReminderEmail] = useState(true)
  const [reminderSms, setReminderSms]     = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const [pending, start]                  = useTransition()

  function handleOpenForm() {
    setSelectedIds(new Set(unregisteredSessions.map((s) => s.id)))
    setShowForm(true)
  }

  function handleToggleId(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function handleSubmit() {
    setError(null)
    start(async () => {
      const ids = [...selectedIds]
      if (ids.length === 0) return
      if (ids.length === 1) {
        const result = await signUpForTraining(ids[0], playerId, selectedMethod, reminderEmail, reminderSms)
        if (result.error) { setError(result.error); return }
        onSignup(ids[0], result.signupId!)
      } else {
        const result = await bulkSignUpForTraining(ids, playerId, selectedMethod, reminderEmail, reminderSms)
        if (result.error) { setError(result.error); return }
        onBulkSignup(result.results)
      }
      setShowForm(false)
    })
  }

  function handleDirectSignup() {
    setError(null)
    start(async () => {
      const sessionId = unregisteredSessions[0].id
      const result = await signUpForTraining(sessionId, playerId, null, reminderEmail, reminderSms)
      if (result.error) { setError(result.error); return }
      onSignup(sessionId, result.signupId!)
    })
  }

  function handleCancel(sessionId: string) {
    const playerData = sessions
      .find((s) => s.id === sessionId)
      ?.players.find((p) => p.player_id === playerId)
    if (!playerData?.signup_id) return
    if (!confirm(`Cancel ${name}'s registration for this session?`)) return
    setError(null)
    start(async () => {
      const result = await cancelTrainingSignup(playerData.signup_id!)
      if (result.error) { setError(result.error); return }
      onCancel(sessionId)
    })
  }

  return (
    <div className="px-5 py-3 bg-white dark:bg-gray-900">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium text-gray-900 dark:text-white">{name}</span>

          {registeredSessions.length > 0 && (
            <div className="mt-1.5 space-y-1">
              {registeredSessions.map((s) => {
                const playerData = s.players.find((p) => p.player_id === playerId)!
                const chosenMethod = paymentMethods.find((m) => m.label === playerData.payment_method)
                return (
                  <div key={s.id} className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{fmtShortDate(s.session_date)}</span>
                    <span className={`text-xs font-medium ${playerData.paid ? "text-green-700 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
                      ✓ Registered{playerData.paid ? " · Paid" : ""}
                    </span>
                    {chosenMethod?.link && paymentAmount && (
                      <a
                        href={chosenMethod.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Pay {paymentAmount} →
                      </a>
                    )}
                    <button
                      onClick={() => handleCancel(s.id)}
                      disabled={pending}
                      className="text-xs text-red-500 hover:underline disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {!showForm && hasUnregistered && (
          <button
            onClick={() => needsForm ? handleOpenForm() : handleDirectSignup()}
            disabled={pending}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shrink-0"
          >
            {pending ? "Signing up…" : registeredSessions.length > 0 ? "+ more sessions" : "Sign up"}
          </button>
        )}
      </div>

      {showForm && (
        <div className="mt-3 space-y-3 pl-1">
          {needsPaymentChoice && (
            <div className="space-y-1.5">
              <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                How will you pay{paymentAmount ? ` (${paymentAmount})` : ""}?
              </p>
              <div className="flex flex-wrap gap-3">
                {paymentMethods.map((pm) => (
                  <label key={pm.label} className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                      type="radio"
                      name={`pay-${playerId}`}
                      checked={selectedMethod === pm.label}
                      onChange={() => setMethod(pm.label)}
                      className="accent-blue-600"
                    />
                    {pm.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {unregisteredSessions.length > 1 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">Select sessions:</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set(unregisteredSessions.map((s) => s.id)))}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Select all
                  </button>
                  <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Deselect all
                  </button>
                </div>
              </div>
              {unregisteredSessions.map((s) => {
                const t = fmtTime(s.session_time)
                return (
                  <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(s.id)}
                      onChange={(e) => handleToggleId(s.id, e.target.checked)}
                      className="accent-blue-600 shrink-0"
                    />
                    <span className="text-gray-700 dark:text-gray-300">
                      {fmtDate(s.session_date)}{t ? ` · ${t}` : ""}
                    </span>
                  </label>
                )
              })}
            </div>
          )}

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={reminderEmail}
                onChange={(e) => { if (!e.target.checked && !reminderSms) return; setReminderEmail(e.target.checked) }}
                className="accent-blue-600"
              />
              Email reminder
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={reminderSms}
                onChange={(e) => { if (!e.target.checked && !reminderEmail) return; setReminderSms(e.target.checked) }}
                className="accent-blue-600"
              />
              Text reminder
            </label>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleSubmit}
              disabled={
                pending ||
                (needsPaymentChoice && !selectedMethod) ||
                (unregisteredSessions.length > 1 && selectedIds.size === 0)
              }
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {pending
                ? "Signing up…"
                : unregisteredSessions.length > 1
                  ? `Confirm (${selectedIds.size} session${selectedIds.size !== 1 ? "s" : ""})`
                  : "Confirm"}
            </button>
            <button
              onClick={() => { setShowForm(false); setMethod(null) }}
              className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!showForm && error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

// ── SimpleDateCard ────────────────────────────────────────────────────────────

function SimpleDateCard({ session }: { session: TrainingSessionForParent }) {
  const time      = fmtTime(session.session_time)
  const endTime   = fmtTime(session.session_end_time)
  const openSlots = session.max_players - session.total_signups
  const isFull    = openSlots <= 0
  const mapTarget = session.location_address || session.location

  return (
    <div className="px-5 py-3 bg-white dark:bg-gray-900">
      {session.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={session.image_url}
          alt=""
          className="w-full h-40 object-cover rounded-lg mb-3"
        />
      )}
      <div className="text-sm font-medium text-gray-900 dark:text-white">
        {fmtDate(session.session_date)}
      </div>
      {time && (
        <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          {time}{endTime ? ` – ${endTime}` : ""}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
        {session.location && (
          <a
            href={mapsLink(mapTarget!)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            {session.location} ↗
          </a>
        )}
        <span className={`text-xs font-medium ${isFull ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
          {isFull ? "Full" : `${openSlots} spot${openSlots !== 1 ? "s" : ""} left`}
        </span>
        {session.payment_amount && (
          <span className="text-xs text-gray-500 dark:text-gray-400">{session.payment_amount}</span>
        )}
      </div>
      {session.description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{session.description}</p>
      )}
      {session.notes && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 italic">{session.notes}</p>
      )}
      {session.signedUpPlayers.length > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          <span className="font-medium">Signed up:</span>{" "}
          {session.signedUpPlayers.map((p) => `${p.first_name} ${p.last_name}`).join(", ")}
        </p>
      )}
    </div>
  )
}

// ── IneligibleDropdown ────────────────────────────────────────────────────────

function IneligibleDropdown({ players }: { players: IneligiblePlayer[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="px-5 py-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
      >
        <span>{open ? "▾" : "▸"}</span>
        {players.length} player{players.length !== 1 ? "s" : ""} not eligible
      </button>
      {open && (
        <ul className="mt-2 space-y-1 pl-4">
          {players.map((p) => (
            <li key={p.player_id} className="text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {p.first_name} {p.last_name}
              </span>
              {" — "}{p.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
