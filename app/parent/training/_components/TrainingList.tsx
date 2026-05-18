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

function fmtTime(t: string | null) {
  if (!t) return null
  const [h, m] = t.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
}

function mapsLink(location: string) {
  return `https://maps.google.com/?q=${encodeURIComponent(location)}`
}

// ── Helpers (grouping) ────────────────────────────────────────────────────────

function groupByDate(sessions: TrainingSessionForParent[]) {
  const map = new Map<string, TrainingSessionForParent[]>()
  for (const s of sessions) {
    if (!map.has(s.session_date)) map.set(s.session_date, [])
    map.get(s.session_date)!.push(s)
  }
  // Sort within each date by session_time (nulls last)
  for (const group of map.values()) {
    group.sort((a, b) => {
      if (!a.session_time && !b.session_time) return 0
      if (!a.session_time) return 1
      if (!b.session_time) return -1
      return a.session_time.localeCompare(b.session_time)
    })
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

  const seriesMap = useMemo(() => {
    const map = new Map<string, TrainingSessionForParent[]>()
    for (const s of sessions) {
      if (!s.series_id) continue
      if (!map.has(s.series_id)) map.set(s.series_id, [])
      map.get(s.series_id)!.push(s)
    }
    return map
  }, [sessions])

  const grouped = groupByDate(sessions)

  // Tally unpaid registrations that have a known payment amount
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
      {Array.from(grouped.entries()).map(([date, dateSessions]) => (
        <DateGroup
          key={date}
          date={date}
          sessions={dateSessions}
          seriesMap={seriesMap}
          onSignup={(sessionId, playerId, signupId) => onSignup(sessionId, playerId, signupId)}
          onCancel={(sessionId, playerId) => onCancel(sessionId, playerId)}
          onBulkSignup={(playerId, results) => onBulkSignup(playerId, results)}
        />
      ))}
    </div>
  )
}

// ── DateGroup ─────────────────────────────────────────────────────────────────

function DateGroup({
  date, sessions, seriesMap, onSignup, onCancel, onBulkSignup,
}: {
  date:         string
  sessions:     TrainingSessionForParent[]
  seriesMap:    Map<string, TrainingSessionForParent[]>
  onSignup:     (sessionId: string, playerId: string, signupId: string) => void
  onCancel:     (sessionId: string, playerId: string) => void
  onBulkSignup: (playerId: string, results: Array<{ sessionId: string; signupId: string }>) => void
}) {
  const [open, setOpen] = useState(false)
  const count = sessions.length

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
      >
        <div>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {fmtDate(date)}
          </span>
          {!open && (
            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
              {count} session{count !== 1 ? "s" : ""} available
            </span>
          )}
        </div>
        <span className="text-gray-400 dark:text-gray-500 text-sm">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {sessions.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              seriesMap={seriesMap}
              onSignup={(playerId, signupId) => onSignup(s.id, playerId, signupId)}
              onCancel={(playerId) => onCancel(s.id, playerId)}
              onBulkSignup={onBulkSignup}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── SessionCard ───────────────────────────────────────────────────────────────

function SessionCard({
  session, seriesMap, onSignup, onCancel, onBulkSignup,
}: {
  session:      TrainingSessionForParent
  seriesMap:    Map<string, TrainingSessionForParent[]>
  onSignup:     (playerId: string, signupId: string) => void
  onCancel:     (playerId: string) => void
  onBulkSignup: (playerId: string, results: Array<{ sessionId: string; signupId: string }>) => void
}) {
  const time      = fmtTime(session.session_time)
  const endTime   = fmtTime(session.session_end_time)
  const openSlots = session.max_players - session.total_signups
  const isFull    = openSlots <= 0

  const siblings = session.series_id ? (seriesMap.get(session.series_id) ?? []) : []

  return (
    <div className="bg-white dark:bg-gray-900">
      {/* Session info */}
      <div className="px-5 py-4">
        {time && (
          <div className="mb-0.5">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {time}{endTime ? ` – ${endTime}` : ""}
            </span>
          </div>
        )}

        <h2 className="text-base font-bold text-gray-900 dark:text-white">{session.title}</h2>

        {session.description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{session.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
          {session.location && (
            <a
              href={mapsLink(session.location)}
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

        {session.notes && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 italic">{session.notes}</p>
        )}
      </div>

      {/* Per-player signup rows */}
      <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
        {session.players.map((player) => {
          // Sibling sessions in this series where this player is eligible but not yet registered
          const unregisteredSiblings = siblings.filter((sibling) =>
            sibling.id !== session.id &&
            sibling.players.some((p) => p.player_id === player.player_id && !p.signup_id)
          )
          return (
            <PlayerRow
              key={player.player_id}
              player={player}
              sessionId={session.id}
              isFull={isFull}
              paymentMethods={session.payment_methods}
              paymentAmount={session.payment_amount}
              unregisteredSiblings={unregisteredSiblings}
              seriesTotal={siblings.length + 1}
              onSignup={(signupId) => onSignup(player.player_id, signupId)}
              onCancel={() => onCancel(player.player_id)}
              onBulkSignup={(results) => onBulkSignup(player.player_id, results)}
            />
          )
        })}

        {/* Signed-up players from other families */}
        {session.signedUpPlayers.length > 0 && (
          <div className="px-5 py-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium">Signed up:</span>{" "}
              {session.signedUpPlayers.map((p) => `${p.first_name} ${p.last_name}`).join(", ")}
            </p>
          </div>
        )}

        {/* Ineligible kids dropdown */}
        {session.ineligiblePlayers.length > 0 && (
          <IneligibleDropdown players={session.ineligiblePlayers} />
        )}
      </div>
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

// ── PlayerRow ─────────────────────────────────────────────────────────────────

function PlayerRow({
  player, sessionId, isFull, paymentMethods, paymentAmount,
  unregisteredSiblings, seriesTotal, onSignup, onCancel, onBulkSignup,
}: {
  player:                EligiblePlayer
  sessionId:             string
  isFull:                boolean
  paymentMethods:        PaymentMethod[]
  paymentAmount:         string | null
  unregisteredSiblings:  TrainingSessionForParent[]
  seriesTotal:           number
  onSignup:              (signupId: string) => void
  onCancel:              () => void
  onBulkSignup:          (results: Array<{ sessionId: string; signupId: string }>) => void
}) {
  const [showForm, setShowForm]       = useState(false)
  const [selectedMethod, setMethod]   = useState<string | null>(null)
  const [error, setError]             = useState<string | null>(null)
  const [pending, start]              = useTransition()
  const isRegistered                  = !!player.signup_id
  const name                          = `${player.first_name} ${player.last_name}`
  const needsPaymentChoice            = paymentMethods.length > 0

  function handleSignup() {
    setError(null)
    start(async () => {
      const result = await signUpForTraining(sessionId, player.player_id, selectedMethod)
      if (result.error) { setError(result.error); return }
      onSignup(result.signupId!)
      setShowForm(false)
    })
  }

  function handleCancel() {
    if (!player.signup_id) return
    if (!confirm(`Cancel ${name}'s registration?`)) return
    setError(null)
    start(async () => {
      const result = await cancelTrainingSignup(player.signup_id!)
      if (result.error) { setError(result.error); return }
      onCancel()
    })
  }

  function handleBulkSignup(includeCurrentSession = false) {
    setError(null)
    const ids = [
      ...(includeCurrentSession && !isRegistered ? [sessionId] : []),
      ...unregisteredSiblings.map((s) => s.id),
    ]
    start(async () => {
      const result = await bulkSignUpForTraining(ids, player.player_id, selectedMethod)
      if (result.error) { setError(result.error); return }
      onBulkSignup(result.results)
      setShowForm(false)
    })
  }

  const registeredCount = seriesTotal > 1
    ? (unregisteredSiblings.length === 0
        ? seriesTotal  // all registered (this one + no remaining siblings)
        : seriesTotal - unregisteredSiblings.length - (isRegistered ? 0 : 1))
    : null

  // Find the payment method object so we can show a link if registered
  const chosenMethod = paymentMethods.find((m) => m.label === player.payment_method)

  return (
    <div className="px-5 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm font-medium text-gray-900 dark:text-white">{name}</span>

        <div className="flex items-center gap-3 shrink-0 flex-wrap justify-end">
          {isRegistered ? (
            <>
              <span className={`text-xs font-semibold ${player.paid ? "text-green-700 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
                ✓ Registered{player.payment_method ? ` · ${player.payment_method}` : ""}
                {registeredCount !== null && ` (${registeredCount}/${seriesTotal})`}
                {player.paid ? " · Paid" : " · Unpaid"}
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
                onClick={handleCancel}
                disabled={pending}
                className="text-xs text-red-500 hover:underline disabled:opacity-50"
              >
                {pending ? "…" : "Cancel"}
              </button>
            </>
          ) : isFull ? (
            <span className="text-xs text-gray-400 dark:text-gray-500">Session full</span>
          ) : !showForm ? (
            <>
              <button
                onClick={() => needsPaymentChoice ? setShowForm(true) : handleSignup()}
                disabled={pending}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {pending ? "Signing up…" : unregisteredSiblings.length > 0 ? "This session" : "Sign up"}
              </button>
              {unregisteredSiblings.length > 0 && (
                <button
                  onClick={() => needsPaymentChoice ? setShowForm(true) : handleBulkSignup(true)}
                  disabled={pending}
                  className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  All {unregisteredSiblings.length + 1} sessions
                </button>
              )}
            </>
          ) : null}

          {/* After registering for this session: offer remaining series sessions */}
          {isRegistered && unregisteredSiblings.length > 0 && !showForm && (
            <button
              onClick={() => needsPaymentChoice ? setShowForm(true) : handleBulkSignup(false)}
              disabled={pending}
              className="text-xs text-purple-600 dark:text-purple-400 hover:underline disabled:opacity-50"
            >
              {pending ? "…" : `+ ${unregisteredSiblings.length} more session${unregisteredSiblings.length !== 1 ? "s" : ""}`}
            </button>
          )}
        </div>
      </div>

      {/* Payment method selection */}
      {showForm && (
        <div className="mt-2 space-y-2 pl-1">
          <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">
            How will you pay{paymentAmount ? ` (${paymentAmount})` : ""}?
          </p>
          <div className="flex flex-wrap gap-3">
            {paymentMethods.map((pm) => (
              <label key={pm.label} className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="radio"
                  name={`pay-${player.player_id}`}
                  checked={selectedMethod === pm.label}
                  onChange={() => setMethod(pm.label)}
                  className="accent-blue-600"
                />
                {pm.label}
              </label>
            ))}
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex items-center gap-3 flex-wrap">
            {!isRegistered && (
              <button
                onClick={handleSignup}
                disabled={pending || !selectedMethod}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {pending ? "Signing up…" : "This session only"}
              </button>
            )}
            {unregisteredSiblings.length > 0 && (
              <button
                onClick={() => handleBulkSignup(!isRegistered)}
                disabled={pending || !selectedMethod}
                className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {pending
                  ? "Signing up…"
                  : isRegistered
                    ? `${unregisteredSiblings.length} remaining session${unregisteredSiblings.length !== 1 ? "s" : ""}`
                    : `All ${unregisteredSiblings.length + 1} sessions`}
              </button>
            )}
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
