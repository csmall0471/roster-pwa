"use client"

import { useState, useTransition } from "react"
import { signUpForTraining, cancelTrainingSignup } from "@/app/(protected)/training/actions"
import type { PaymentMethod } from "@/app/(protected)/training/actions"

// ── Types ─────────────────────────────────────────────────────────────────────

export type EligiblePlayer = {
  player_id:      string
  first_name:     string
  last_name:      string
  signup_id:      string | null
  payment_method: string | null
}

export type TrainingSessionForParent = {
  id:              string
  title:           string
  description:     string | null
  location:        string | null
  session_date:    string
  session_time:    string | null
  session_end_time: string | null
  max_players:     number
  payment_amount:  string | null
  payment_methods: PaymentMethod[]
  notes:           string | null
  total_signups:   number
  players:         EligiblePlayer[]
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
                p.player_id === playerId ? { ...p, signup_id: signupId } : p
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

  return (
    <div className="space-y-4">
      {sessions.map((s) => (
        <SessionCard
          key={s.id}
          session={s}
          onSignup={(playerId, signupId) => onSignup(s.id, playerId, signupId)}
          onCancel={(playerId) => onCancel(s.id, playerId)}
        />
      ))}
    </div>
  )
}

// ── SessionCard ───────────────────────────────────────────────────────────────

function SessionCard({
  session, onSignup, onCancel,
}: {
  session:  TrainingSessionForParent
  onSignup: (playerId: string, signupId: string) => void
  onCancel: (playerId: string) => void
}) {
  const time      = fmtTime(session.session_time)
  const endTime   = fmtTime(session.session_end_time)
  const openSlots = session.max_players - session.total_signups
  const isFull    = openSlots <= 0

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Session info */}
      <div className="px-5 py-4">
        <div className="flex items-baseline gap-2 flex-wrap mb-0.5">
          <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            {fmtDate(session.session_date)}
          </span>
          {time && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {time}{endTime ? ` – ${endTime}` : ""}
            </span>
          )}
        </div>

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
        {session.players.map((player) => (
          <PlayerRow
            key={player.player_id}
            player={player}
            sessionId={session.id}
            isFull={isFull}
            paymentMethods={session.payment_methods}
            paymentAmount={session.payment_amount}
            onSignup={(signupId) => onSignup(player.player_id, signupId)}
            onCancel={() => onCancel(player.player_id)}
          />
        ))}
      </div>
    </div>
  )
}

// ── PlayerRow ─────────────────────────────────────────────────────────────────

function PlayerRow({
  player, sessionId, isFull, paymentMethods, paymentAmount, onSignup, onCancel,
}: {
  player:         EligiblePlayer
  sessionId:      string
  isFull:         boolean
  paymentMethods: PaymentMethod[]
  paymentAmount:  string | null
  onSignup:       (signupId: string) => void
  onCancel:       () => void
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

  // Find the payment method object so we can show a link if registered
  const chosenMethod = paymentMethods.find((m) => m.label === player.payment_method)

  return (
    <div className="px-5 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm font-medium text-gray-900 dark:text-white">{name}</span>

        <div className="flex items-center gap-3 shrink-0">
          {isRegistered ? (
            <>
              <span className="text-xs font-semibold text-green-700 dark:text-green-400">
                ✓ Registered{player.payment_method ? ` · ${player.payment_method}` : ""}
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
            <button
              onClick={() => needsPaymentChoice ? setShowForm(true) : handleSignup()}
              disabled={pending}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {pending ? "Signing up…" : "Sign up"}
            </button>
          ) : null}
        </div>
      </div>

      {/* Payment method selection */}
      {showForm && !isRegistered && (
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
          <div className="flex items-center gap-3">
            <button
              onClick={handleSignup}
              disabled={pending || !selectedMethod}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {pending ? "Signing up…" : "Confirm"}
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
