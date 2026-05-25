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

// Group by series_id (or by session id for standalones)
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

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
      >
        <div>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
          {!open && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</div>
          )}
        </div>
        <span className="text-gray-400 dark:text-gray-500 text-sm ml-4 shrink-0">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {sessions.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              seriesSessions={sessions}
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
  session, seriesSessions, onSignup, onCancel, onBulkSignup,
}: {
  session:      TrainingSessionForParent
  seriesSessions: TrainingSessionForParent[]
  onSignup:     (playerId: string, signupId: string) => void
  onCancel:     (playerId: string) => void
  onBulkSignup: (playerId: string, results: Array<{ sessionId: string; signupId: string }>) => void
}) {
  const time      = fmtTime(session.session_time)
  const endTime   = fmtTime(session.session_end_time)
  const openSlots = session.max_players - session.total_signups
  const isFull    = openSlots <= 0

  return (
    <div className="bg-white dark:bg-gray-900">
      <div className="px-5 py-4">
        {/* Date is the primary label inside an expanded series */}
        <div className="text-sm font-semibold text-gray-900 dark:text-white">
          {fmtDate(session.session_date)}
        </div>

        {time && (
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {time}{endTime ? ` – ${endTime}` : ""}
          </div>
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

        {session.description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{session.description}</p>
        )}
        {session.notes && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 italic">{session.notes}</p>
        )}
      </div>

      <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
        {session.players.map((player) => (
          <PlayerRow
            key={player.player_id}
            player={player}
            session={session}
            seriesSessions={seriesSessions}
            isFull={isFull}
            paymentMethods={session.payment_methods}
            paymentAmount={session.payment_amount}
            onSignup={(signupId) => onSignup(player.player_id, signupId)}
            onCancel={() => onCancel(player.player_id)}
            onBulkSignup={(results) => onBulkSignup(player.player_id, results)}
          />
        ))}

        {session.signedUpPlayers.length > 0 && (
          <div className="px-5 py-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium">Signed up:</span>{" "}
              {session.signedUpPlayers.map((p) => `${p.first_name} ${p.last_name}`).join(", ")}
            </p>
          </div>
        )}

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
  player, session, seriesSessions, isFull, paymentMethods, paymentAmount,
  onSignup, onCancel, onBulkSignup,
}: {
  player:          EligiblePlayer
  session:         TrainingSessionForParent
  seriesSessions:  TrainingSessionForParent[]
  isFull:          boolean
  paymentMethods:  PaymentMethod[]
  paymentAmount:   string | null
  onSignup:        (signupId: string) => void
  onCancel:        () => void
  onBulkSignup:    (results: Array<{ sessionId: string; signupId: string }>) => void
}) {
  const isRegistered    = !!player.signup_id
  const isInSeries      = seriesSessions.length > 1
  const name            = `${player.first_name} ${player.last_name}`
  const needsPaymentChoice = paymentMethods.length > 0

  // Sessions in this series where the player is eligible, not yet registered, and not full
  const unregisteredSessions = useMemo(() =>
    isInSeries
      ? seriesSessions.filter((s) =>
          s.players.some((p) => p.player_id === player.player_id && !p.signup_id) &&
          s.total_signups < s.max_players
        )
      : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seriesSessions, player.signup_id, isInSeries, player.player_id]
  )

  const hasMultipleToChoose = unregisteredSessions.length > 1
  const needsForm           = needsPaymentChoice || hasMultipleToChoose

  const [showForm, setShowForm]         = useState(false)
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set())
  const [selectedMethod, setMethod]     = useState<string | null>(null)
  const [reminderEmail, setReminderEmail] = useState(false)
  const [reminderSms, setReminderSms]   = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [pending, start]                = useTransition()

  function handleOpenForm() {
    // Pre-select all available unregistered sessions
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
      if (!isInSeries) {
        // Standalone session
        const result = await signUpForTraining(
          session.id, player.player_id, selectedMethod, reminderEmail, reminderSms
        )
        if (result.error) { setError(result.error); return }
        onSignup(result.signupId!)
      } else {
        // Series: bulk signup for all selected sessions
        const ids = [...selectedIds]
        if (ids.length === 0) return
        const result = await bulkSignUpForTraining(
          ids, player.player_id, selectedMethod, reminderEmail, reminderSms
        )
        if (result.error) { setError(result.error); return }
        onBulkSignup(result.results)
      }
      setShowForm(false)
    })
  }

  function handleDirectSignup() {
    // Bypass form for simple cases (no payment choice, single session)
    setError(null)
    start(async () => {
      const result = await signUpForTraining(
        session.id, player.player_id, null, reminderEmail, reminderSms
      )
      if (result.error) { setError(result.error); return }
      onSignup(result.signupId!)
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

  // How many series sessions is this player registered for?
  const registeredCount = isInSeries
    ? seriesSessions.filter((s) =>
        s.players.some((p) => p.player_id === player.player_id && p.signup_id)
      ).length
    : null

  const chosenMethod = paymentMethods.find((m) => m.label === player.payment_method)

  // Determine what action button to show
  const showSignupButton = !isRegistered && (!isFull || unregisteredSessions.length > 0)

  return (
    <div className="px-5 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm font-medium text-gray-900 dark:text-white">{name}</span>

        <div className="flex items-center gap-3 shrink-0 flex-wrap justify-end">
          {isRegistered ? (
            <>
              <span className={`text-xs font-semibold ${player.paid ? "text-green-700 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
                ✓ Registered{player.payment_method ? ` · ${player.payment_method}` : ""}
                {registeredCount !== null && ` (${registeredCount}/${seriesSessions.length})`}
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
          ) : isFull && unregisteredSessions.length === 0 ? (
            <span className="text-xs text-gray-400 dark:text-gray-500">Session full</span>
          ) : !showForm && showSignupButton ? (
            <button
              onClick={() => needsForm ? handleOpenForm() : handleDirectSignup()}
              disabled={pending}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {pending ? "Signing up…" : isFull ? "Sign up for other dates" : "Sign up"}
            </button>
          ) : null}

          {/* Add more sessions after already registered */}
          {isRegistered && unregisteredSessions.length > 0 && !showForm && (
            <button
              onClick={handleOpenForm}
              disabled={pending}
              className="text-xs text-purple-600 dark:text-purple-400 hover:underline disabled:opacity-50"
            >
              + {unregisteredSessions.length} more
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="mt-3 space-y-3 pl-1">
          {/* Payment choice */}
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
                      name={`pay-${player.player_id}-${session.id}`}
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

          {/* Multi-session selector */}
          {hasMultipleToChoose && (
            <div className="space-y-2">
              <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                Select sessions:
              </p>
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

          {/* Reminder preferences */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
              <input type="checkbox" checked={reminderEmail} onChange={(e) => setReminderEmail(e.target.checked)} className="accent-blue-600" />
              Email reminder
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
              <input type="checkbox" checked={reminderSms} onChange={(e) => setReminderSms(e.target.checked)} className="accent-blue-600" />
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
                (hasMultipleToChoose && selectedIds.size === 0)
              }
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {pending
                ? "Signing up…"
                : hasMultipleToChoose
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
