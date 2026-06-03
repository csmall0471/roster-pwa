"use client"

import { useState, useTransition, useMemo, Fragment } from "react"
import { signUpForTraining, cancelTrainingSignup, bulkSignUpForTraining, cancelMultipleTrainingSignups } from "@/app/(protected)/training/actions"
import type { PaymentMethod } from "@/app/(protected)/training/actions"
import { describeRules } from "@/lib/training-eligibility"
import { track } from "@vercel/analytics"
import { logClientActivity } from "@/app/actions/log-activity"

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
  eligibility_label: string | null
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

const DAY_PLURAL = ["Sundays","Mondays","Tuesdays","Wednesdays","Thursdays","Fridays","Saturdays"]

function getDurationMins(start: string | null, end: string | null): number | null {
  if (!start || !end) return null
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  const d = (eh * 60 + em) - (sh * 60 + sm)
  return d > 0 ? d : null
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

// ── PayLink ───────────────────────────────────────────────────────────────────

function PayLink({
  method,
  paymentAmount,
  className = "text-xs text-blue-600 dark:text-blue-400 hover:underline",
}: {
  method: PaymentMethod
  paymentAmount: string | null
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  if (!method.link) return null

  if (method.link.startsWith("tel:")) {
    const phone = method.link.replace("tel:", "")
    return (
      <button
        onClick={() => {
          track("training_payment_clicked", { method: method.label });
          logClientActivity("training_payment_clicked", { method: method.label }).catch(() => {});
          navigator.clipboard.writeText(phone)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }}
        className={className}
      >
        {copied ? "Copied!" : `${method.label}: ${phone}`}
      </button>
    )
  }

  let url = method.link
  if (url.includes("venmo.com") && paymentAmount) {
    const amt = paymentAmount.replace(/[^0-9.]/g, "")
    if (amt) url = `${url}${url.includes("?") ? "&" : "?"}txn=pay&amount=${amt}&note=Training`
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={className} onClick={() => { track("training_payment_clicked", { method: method.label }); logClientActivity("training_payment_clicked", { method: method.label }).catch(() => {}); }}>
      Pay ${paymentAmount ?? ""} via {method.label} →
    </a>
  )
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

  const unpaidPayLinks = useMemo(() => {
    const seen = new Set<string>()
    const links: PaymentMethod[] = []
    for (const s of sessions) {
      if (!s.payment_amount) continue
      for (const p of s.players) {
        if (!p.signup_id || p.paid) continue
        const chosen = (s.payment_methods ?? []).find((m) => m.label === p.payment_method)
        if (chosen?.link && !seen.has(chosen.label)) {
          seen.add(chosen.label)
          links.push(chosen)
        }
      }
    }
    return links
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
          {unpaidPayLinks.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {unpaidPayLinks.map((m) => (
                <PayLink
                  key={m.label}
                  method={m}
                  paymentAmount={unpaidTotal.toFixed(2)}
                  className="text-xs text-amber-700 dark:text-amber-300 font-medium hover:underline"
                />
              ))}
            </div>
          )}
        </div>
      )}
      {Array.from(grouped.values())
        .filter((seriesSessions) => seriesSessions.some((s) => s.players.length > 0))
        .map((seriesSessions) => (
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
  const [open, setOpen]             = useState(false)
  const [fullImg, setFullImg]       = useState<string | null>(null)
  const [showBulkForm, setShowBulkForm] = useState(false)
  const title        = sessions[0].title
  const count        = sessions.length
  const firstDate    = sessions[0].session_date
  const lastDate     = sessions[sessions.length - 1].session_date
  const firstSession = sessions[0]

  const subtitle = count === 1
    ? fmtDate(firstDate)
    : `${count} sessions · ${fmtShortDate(firstDate)} – ${fmtShortDate(lastDate)}`

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

  const costLabel  = firstSession.payment_amount ? `${firstSession.payment_amount}/session` : null
  const metaItems  = [firstSession.location, costLabel].filter(Boolean)

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

  const playersWithUnregistered = useMemo(() =>
    allPlayers.filter((pl) =>
      sessions.some((s) =>
        s.players.some((p) => p.player_id === pl.player_id && !p.signup_id) &&
        s.total_signups < s.max_players
      )
    ),
    [allPlayers, sessions]
  )

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        onClick={() => { if (!open) { track("training_series_expanded", { title }); logClientActivity("training_series_expanded", { title }).catch(() => {}); } setOpen((v) => !v); }}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
            {firstSession.eligibility_label && (
              <span className="text-xs text-blue-600 dark:text-blue-400">{firstSession.eligibility_label}</span>
            )}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 space-y-0.5">
            <div>{subtitle}</div>
            {dayTimesDisplay && <div>{dayTimesDisplay}</div>}
            {metaItems.length > 0 && <div>{metaItems.join(" · ")}</div>}
          </div>
        </div>
        <span className="text-gray-400 dark:text-gray-500 text-sm ml-4 shrink-0">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div>
          {/* Series-level image, description, notes — shown once */}
          {(firstSession.image_url || firstSession.description || firstSession.notes) && (
            <div className="px-5 py-4 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
              {firstSession.image_url && (
                <button
                  type="button"
                  onClick={() => setFullImg(firstSession.image_url!)}
                  className="block w-full mb-3"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={firstSession.image_url} alt="" className="w-full h-48 object-cover rounded-lg cursor-zoom-in" />
                </button>
              )}
              {firstSession.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400">{firstSession.description}</p>
              )}
              {firstSession.notes && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 italic">{firstSession.notes}</p>
              )}
            </div>
          )}

          {/* Per-player signup/status rows */}
          {allPlayers.length > 0 && (
            <div className="border-b border-gray-200 dark:border-gray-700">
              {showBulkForm ? (
                <BulkPlayerForm
                  sessions={sessions}
                  players={playersWithUnregistered}
                  onSuccess={(playerId, results) => onBulkSignup(playerId, results)}
                  onDone={() => setShowBulkForm(false)}
                />
              ) : (
                <>
                  {playersWithUnregistered.length >= 2 && (
                    <div className="px-5 py-2.5 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800 flex items-center justify-between gap-3">
                      <span className="text-xs text-blue-700 dark:text-blue-300">
                        {playersWithUnregistered.length} players can sign up
                      </span>
                      <button
                        onClick={() => setShowBulkForm(true)}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                      >
                        Register all →
                      </button>
                    </div>
                  )}
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
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
                </>
              )}
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
      {fullImg && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setFullImg(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fullImg}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full rounded-lg object-contain"
          />
          <button
            className="absolute top-4 right-4 text-white text-3xl leading-none hover:opacity-80"
            onClick={() => setFullImg(null)}
            aria-label="Close"
          >
            ✕
          </button>
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

  const uniqueDays = useMemo(() =>
    [...new Set(unregisteredSessions.map(s => new Date(s.session_date + "T00:00:00").getDay()))].sort((a, b) => a - b),
    [unregisteredSessions]
  )

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

  function handleCancelAll() {
    if (!confirm(`Cancel all ${registeredSessions.length} registrations for ${name}?`)) return
    const signupIds = registeredSessions
      .map((s) => s.players.find((p) => p.player_id === playerId)?.signup_id)
      .filter(Boolean) as string[]
    setError(null)
    start(async () => {
      const result = await cancelMultipleTrainingSignups(signupIds)
      if (result.error) { setError(result.error); return }
      registeredSessions.forEach((s) => onCancel(s.id))
    })
  }

  // Payment summary for registered sessions
  const paidCount   = registeredSessions.filter((s) => s.players.find((p) => p.player_id === playerId)?.paid).length
  const unpaidCount = registeredSessions.length - paidCount
  const amtNum      = paymentAmount ? parseFloat(paymentAmount.replace(/[^0-9.]/g, "")) || 0 : 0
  const totalDue    = unpaidCount * amtNum
  const firstUnpaid = registeredSessions.find((s) => !s.players.find((p) => p.player_id === playerId)?.paid)
  const unpaidPayMethod = paymentMethods.find(
    (m) => m.label === firstUnpaid?.players.find((p) => p.player_id === playerId)?.payment_method
  )

  return (
    <div className="px-5 py-3 bg-white dark:bg-gray-900">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900 dark:text-white">{name}</span>
            {registeredSessions.length > 1 && (
              <button
                onClick={handleCancelAll}
                disabled={pending}
                className="text-xs text-red-500 hover:underline disabled:opacity-50"
              >
                Cancel all
              </button>
            )}
          </div>

          {registeredSessions.length > 0 && (
            <>
              {/* Payment summary — once per player, not per session */}
              <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {registeredSessions.length} session{registeredSessions.length !== 1 ? "s" : ""} registered
                </span>
                {paymentAmount && (
                  unpaidCount > 0 ? (
                    <>
                      <span className="text-xs text-amber-600 dark:text-amber-400">
                        · ${totalDue.toFixed(2)} due
                      </span>
                      {unpaidPayMethod && (
                        <PayLink method={unpaidPayMethod} paymentAmount={totalDue.toFixed(2)} />
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-green-600 dark:text-green-400">· All paid ✓</span>
                  )
                )}
              </div>

              {/* Per-session rows — date + status + cancel */}
              <div className="mt-1.5 space-y-1">
                {registeredSessions.map((s) => {
                  const playerData = s.players.find((p) => p.player_id === playerId)!
                  return (
                    <div key={s.id} className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-500 dark:text-gray-400">{fmtShortDate(s.session_date)}</span>
                      <span className={`text-xs font-medium ${playerData.paid ? "text-green-700 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
                        ✓{playerData.paid ? " Paid" : " Registered"}
                      </span>
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
            </>
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
              <div className="flex items-center justify-between flex-wrap gap-1">
                <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">Select sessions:</p>
                <div className="flex gap-2 flex-wrap items-center">
                  {uniqueDays.length >= 2 && uniqueDays.map((day, i) => (
                    <Fragment key={day}>
                      {i > 0 && <span className="text-xs text-gray-300 dark:text-gray-600">·</span>}
                      <button
                        type="button"
                        onClick={() => setSelectedIds(new Set(
                          unregisteredSessions.filter(s => new Date(s.session_date + "T00:00:00").getDay() === day).map(s => s.id)
                        ))}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {DAY_PLURAL[day]} Only
                      </button>
                    </Fragment>
                  ))}
                  {uniqueDays.length >= 2 && <span className="text-xs text-gray-300 dark:text-gray-600">·</span>}
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set(unregisteredSessions.map((s) => s.id)))}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    All
                  </button>
                  <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    None
                  </button>
                </div>
              </div>
              {unregisteredSessions.map((s) => {
                const t   = fmtTime(s.session_time)
                const e   = fmtTime(s.session_end_time)
                const dur = getDurationMins(s.session_time, s.session_end_time)
                const timeStr = t ? (e ? `${t} – ${e}` : t) : ""
                const durStr  = dur && !e ? ` (${dur} min)` : dur ? ` · ${dur} min` : ""
                return (
                  <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(s.id)}
                      onChange={(e) => handleToggleId(s.id, e.target.checked)}
                      className="accent-blue-600 shrink-0"
                    />
                    <span className="text-gray-700 dark:text-gray-300">
                      {fmtDate(s.session_date)}{timeStr ? ` · ${timeStr}${durStr}` : ""}
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
          {reminderSms && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed mt-1">
              By checking &ldquo;Text reminder&rdquo; you agree to receive a
              recurring automated SMS reminder from CS Sports AZ for this
              training registration. Msg freq varies. Msg&amp;Data rates may
              apply. Reply STOP to opt out, HELP for help. See{" "}
              <a href="/privacy" target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 underline">Privacy Policy</a>
              {" "}and{" "}
              <a href="/sms-terms" target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 underline">SMS Terms</a>.
            </p>
          )}

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
      </div>
      {session.signedUpPlayers.length > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          <span className="font-medium">Signed up:</span>{" "}
          {session.signedUpPlayers.map((p) => `${p.first_name} ${p.last_name}`).join(", ")}
        </p>
      )}
    </div>
  )
}

// ── BulkPlayerForm ────────────────────────────────────────────────────────────

function BulkPlayerForm({
  sessions,
  players,
  onSuccess,
  onDone,
}: {
  sessions: TrainingSessionForParent[]
  players:  Array<{ player_id: string; first_name: string; last_name: string }>
  onSuccess: (playerId: string, results: Array<{ sessionId: string; signupId: string }>) => void
  onDone:    () => void
}) {
  const paymentMethods     = sessions[0]?.payment_methods ?? []
  const paymentAmount      = sessions[0]?.payment_amount ?? null
  const needsPaymentChoice = paymentMethods.length > 0

  const availableSessions = useMemo(() =>
    sessions.filter((s) =>
      players.some((pl) =>
        s.players.some((p) => p.player_id === pl.player_id && !p.signup_id) &&
        s.total_signups < s.max_players
      )
    ),
    [sessions, players]
  )

  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(
    () => new Set(players.map((p) => p.player_id))
  )
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(
    () => new Set(availableSessions.map((s) => s.id))
  )
  const [paymentMethod, setPaymentMethod]     = useState<string | null>(null)
  const [reminderEmail, setReminderEmail]     = useState(true)
  const [reminderSms, setReminderSms]         = useState(false)
  const [errors, setErrors]                   = useState<string[]>([])
  const [pending, start]                      = useTransition()

  function handleSubmit() {
    setErrors([])
    start(async () => {
      const errs: string[] = []
      for (const playerId of selectedPlayers) {
        const sessionIds = [...selectedSessions].filter((sid) => {
          const s = sessions.find((s) => s.id === sid)
          return s?.players.some((p) => p.player_id === playerId && !p.signup_id) && (s?.total_signups ?? 0) < (s?.max_players ?? 0)
        })
        if (sessionIds.length === 0) continue
        const result = await bulkSignUpForTraining(sessionIds, playerId, paymentMethod, reminderEmail, reminderSms)
        if (result.error) {
          const pl = players.find((p) => p.player_id === playerId)
          errs.push(`${pl?.first_name ?? "Player"}: ${result.error}`)
        } else {
          onSuccess(playerId, result.results)
        }
      }
      setErrors(errs)
      if (errs.length === 0) onDone()
    })
  }

  const effectiveSessionCount = [...selectedSessions].filter((sid) =>
    [...selectedPlayers].some((pid) => {
      const s = sessions.find((s) => s.id === sid)
      return s?.players.some((p) => p.player_id === pid && !p.signup_id)
    })
  ).length

  return (
    <div className="px-5 py-4 bg-white dark:bg-gray-900 space-y-4">
      <div>
        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Players:</p>
        <div className="space-y-1.5">
          {players.map((p) => (
            <label key={p.player_id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selectedPlayers.has(p.player_id)}
                onChange={(e) => setSelectedPlayers((prev) => {
                  const next = new Set(prev)
                  if (e.target.checked) next.add(p.player_id)
                  else next.delete(p.player_id)
                  return next
                })}
                className="accent-blue-600 shrink-0"
              />
              <span className="text-gray-800 dark:text-gray-200">{p.first_name} {p.last_name}</span>
            </label>
          ))}
        </div>
      </div>

      {availableSessions.length > 1 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Sessions:</p>
            <div className="flex gap-2 items-center">
              <button type="button" onClick={() => setSelectedSessions(new Set(availableSessions.map((s) => s.id)))} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">All</button>
              <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
              <button type="button" onClick={() => setSelectedSessions(new Set())} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">None</button>
            </div>
          </div>
          <div className="space-y-1.5">
            {availableSessions.map((s) => {
              const t = fmtTime(s.session_time)
              const e = fmtTime(s.session_end_time)
              const timeStr = t ? (e ? ` · ${t} – ${e}` : ` · ${t}`) : ""
              return (
                <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedSessions.has(s.id)}
                    onChange={(ev) => setSelectedSessions((prev) => {
                      const next = new Set(prev)
                      if (ev.target.checked) next.add(s.id)
                      else next.delete(s.id)
                      return next
                    })}
                    className="accent-blue-600 shrink-0"
                  />
                  <span className="text-gray-700 dark:text-gray-300">{fmtDate(s.session_date)}{timeStr}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}

      {needsPaymentChoice && (
        <div>
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
            How will you pay{paymentAmount ? ` (${paymentAmount}/player per session)` : ""}?
          </p>
          <div className="flex flex-wrap gap-3">
            {paymentMethods.map((pm) => (
              <label key={pm.label} className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="radio"
                  name="bulk-pay"
                  checked={paymentMethod === pm.label}
                  onChange={() => setPaymentMethod(pm.label)}
                  className="accent-blue-600"
                />
                {pm.label}
              </label>
            ))}
          </div>
        </div>
      )}

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
      {reminderSms && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed mt-1">
          By checking &ldquo;Text reminder&rdquo; you agree to receive recurring
          automated SMS reminders from CS Sports AZ for each training session
          you register for. Msg freq varies. Msg&amp;Data rates may apply.
          Reply STOP to opt out, HELP for help. See{" "}
          <a href="/privacy" target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 underline">Privacy Policy</a>
          {" "}and{" "}
          <a href="/sms-terms" target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 underline">SMS Terms</a>.
        </p>
      )}

      {errors.map((err, i) => (
        <p key={i} className="text-xs text-red-500">{err}</p>
      ))}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleSubmit}
          disabled={
            pending ||
            selectedPlayers.size === 0 ||
            effectiveSessionCount === 0 ||
            (needsPaymentChoice && !paymentMethod)
          }
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {pending
            ? "Signing up…"
            : `Register ${selectedPlayers.size} player${selectedPlayers.size !== 1 ? "s" : ""}`}
        </button>
        <button onClick={onDone} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
          Cancel
        </button>
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
