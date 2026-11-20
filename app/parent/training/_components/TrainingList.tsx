"use client"

import { useState, useTransition, useMemo, Fragment } from "react"
import { signUpForTraining, cancelTrainingSignup, bulkSignUpForTraining, cancelMultipleTrainingSignups, signUpForTrainingSeries, setTrainingAttendance } from "@/app/(protected)/training/actions"
import { fmtPackagePrice, packageSummary, packagePriceCents, packageKidPrice, isSiblingPrice, packageFamilyTotal, siblingSummary } from "@/lib/training-package"
import { venmoPayLink } from "@/lib/event-pay"
import { seriesTimesSummary } from "@/lib/training-schedule"
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
  /** Whole-series registration: false when the parent marked this date as missed. */
  attending:      boolean
  /** When this kid signed up for this date — orders siblings for sibling pricing. */
  registered_at?: string | null
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
  /** Whole-series signup: one registration for every date, one price. */
  package_only:      boolean
  package_price:     string | null
  /** Each extra kid from the family: "50%" (off) or "$50"; null = full price. */
  package_sibling_price: string | null
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

/** "Sun, Nov 22" */
function fmtRowDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
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
                p.player_id === playerId ? { ...p, signup_id: signupId, paid: false, attending: true } : p
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
            p.player_id === playerId ? { ...p, signup_id: result.signupId, paid: false, attending: true } : p
          ),
        }
      })
    )
  }

  function onAttendance(sessionId: string, playerId: string, attending: boolean) {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? { ...s, players: s.players.map((p) => (p.player_id === playerId ? { ...p, attending } : p)) }
          : s
      )
    )
  }

  const grouped = useMemo(() => groupBySeries(sessions), [sessions])

  return (
    <div className="space-y-3">
      {Array.from(grouped.values())
        .filter((seriesSessions) => seriesSessions.some((s) => s.players.length > 0))
        .map((seriesSessions) => (
          <SeriesGroup
            key={seriesSessions[0].series_id ?? seriesSessions[0].id}
            sessions={seriesSessions}
            onSignup={onSignup}
            onCancel={onCancel}
            onBulkSignup={onBulkSignup}
            onAttendance={onAttendance}
          />
        ))}
    </div>
  )
}

// ── SeriesGroup ───────────────────────────────────────────────────────────────

function SeriesGroup({
  sessions, onSignup, onCancel, onBulkSignup, onAttendance,
}: {
  sessions:     TrainingSessionForParent[]
  onSignup:     (sessionId: string, playerId: string, signupId: string) => void
  onCancel:     (sessionId: string, playerId: string) => void
  onBulkSignup: (playerId: string, results: Array<{ sessionId: string; signupId: string }>) => void
  onAttendance: (sessionId: string, playerId: string, attending: boolean) => void
}) {
  // Open by default so parents see the signup without tapping in; the
  // details inside stay condensed (tap a date or "More" for the rest).
  const [open, setOpen]             = useState(true)
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

  // "Tuesdays 5:30 PM" for a weekly series; just the time(s) for hand-picked dates.
  const dayTimesDisplay = seriesTimesSummary(sessions)

  const metaItems  = [firstSession.location].filter(Boolean)
  const isPackage  = firstSession.package_only && !!firstSession.series_id
  const anyRegistered = sessions.some((s) => s.players.some((p) => p.signup_id))

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
          {isPackage && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/40 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                {packageSummary(firstSession.package_price, count)}
              </span>
              {siblingSummary(firstSession.package_price, firstSession.package_sibling_price) && (
                <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
                  {siblingSummary(firstSession.package_price, firstSession.package_sibling_price)}
                </span>
              )}
            </div>
          )}
        </div>
        <span className="text-gray-400 dark:text-gray-500 text-sm ml-4 shrink-0">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div>
          {/* Series-level photo, description, notes — condensed, "More" for the rest */}
          {(firstSession.image_url || firstSession.description || firstSession.notes) && (
            <SeriesAbout
              imageUrl={firstSession.image_url}
              description={firstSession.description}
              notes={firstSession.notes}
              onOpenImage={setFullImg}
            />
          )}

          {/* Whole-series package: one registration per kid for every date */}
          {isPackage && allPlayers.length > 0 && (
            <PackageSection
              sessions={sessions}
              players={allPlayers}
              onBulkSignup={onBulkSignup}
              onCancel={onCancel}
            />
          )}

          {/* Per-player signup/status rows */}
          {!isPackage && allPlayers.length > 0 && (
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

          {/* Dates — one line each, tap for details; for a whole-series kid, a Going toggle per date */}
          <DateList
            sessions={sessions}
            isPackage={isPackage}
            anyRegistered={anyRegistered}
            onAttendance={onAttendance}
          />
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

  const needsForm = unregisteredSessions.length > 1

  const [showForm, setShowForm]           = useState(false)
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set())
  // Reminder opts default off — neither email nor SMS is required to register.
  const [reminderEmail, setReminderEmail] = useState(true)  // on by default; parents can untick
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
        const result = await signUpForTraining(ids[0], playerId, null, reminderEmail, reminderSms)
        if (result.error) { setError(result.error); return }
        onSignup(ids[0], result.signupId!)
      } else {
        const result = await bulkSignUpForTraining(ids, playerId, null, reminderEmail, reminderSms)
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
              <div className="mt-0.5">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {registeredSessions.length} session{registeredSessions.length !== 1 ? "s" : ""} registered
                </span>
              </div>

              {/* Per-session rows — date + status + cancel */}
              <div className="mt-1.5 space-y-1">
                {registeredSessions.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{fmtShortDate(s.session_date)}</span>
                    <span className="text-xs font-medium text-green-700 dark:text-green-400">
                      ✓ Registered
                    </span>
                    <button
                      onClick={() => handleCancel(s.id)}
                      disabled={pending}
                      className="text-xs text-red-500 hover:underline disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                ))}
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

          <div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">
              We’ll email a reminder the day before — untick to skip it.
            </p>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reminderEmail}
                  onChange={(e) => setReminderEmail(e.target.checked)}
                  className="accent-blue-600"
                />
                Email reminder
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reminderSms}
                  onChange={(e) => setReminderSms(e.target.checked)}
                  className="accent-blue-600"
                />
                Text reminder
              </label>
            </div>
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
              onClick={() => setShowForm(false)}
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

// ── PackageSection ────────────────────────────────────────────────────────────
// Whole-series signup: each kid registers once for every date at one price.

function payLinkLabel(m: PaymentMethod): string {
  if (!m.link?.startsWith("tel:")) return m.label
  const d = m.link.slice(4).replace(/\D/g, "")
  return `${m.label} ${d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : m.link.slice(4)}`
}

function PackageSection({
  sessions, players, onBulkSignup, onCancel,
}: {
  sessions:     TrainingSessionForParent[]
  players:      Array<{ player_id: string; first_name: string; last_name: string }>
  onBulkSignup: (playerId: string, results: Array<{ sessionId: string; signupId: string }>) => void
  onCancel:     (sessionId: string, playerId: string) => void
}) {
  const first     = sessions[0]
  const seriesId  = first.series_id!
  const count     = sessions.length
  const price     = fmtPackagePrice(first.package_price)
  const spotsLeft = Math.max(0, Math.min(...sessions.map((s) => s.max_players - s.total_signups)))
  const payMethods = (first.payment_methods ?? []).filter((m) => m.label?.trim())

  // Everyone registered, once (names are the same on every date).
  const whoIsIn = useMemo(() => {
    const names = new Set<string>()
    for (const s of sessions) for (const p of s.signedUpPlayers) names.add(`${p.first_name} ${p.last_name}`)
    return [...names]
  }, [sessions])

  const status = useMemo(() => players.map((pl) => {
    const regs = sessions.flatMap((s) =>
      s.players
        .filter((p) => p.player_id === pl.player_id && p.signup_id)
        .map((p) => ({ sessionId: s.id, signupId: p.signup_id!, paid: p.paid, attending: p.attending })),
    )
    const missing = sessions.filter((s) =>
      s.players.some((p) => p.player_id === pl.player_id && !p.signup_id),
    )
    const regTimes = sessions.flatMap((s) =>
      s.players.filter((p) => p.player_id === pl.player_id && p.signup_id && p.registered_at).map((p) => p.registered_at!),
    )
    return {
      ...pl, regs, missing,
      paid:    regs.length > 0 && regs.every((r) => r.paid),
      firstAt: regTimes.length ? regTimes.sort()[0] : "",
    }
  }), [players, sessions])

  const unregistered = status.filter((p) => p.regs.length === 0)

  // Sibling pricing: the first of your kids to register pays full price, each
  // one after that the sibling price.
  const sibling        = first.package_sibling_price
  const registeredKids = status
    .filter((p) => p.regs.length > 0)
    .sort((a, b) => a.firstAt.localeCompare(b.firstAt) || a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name))
  const nthOf = (playerId: string) => {
    const i = registeredKids.findIndex((p) => p.player_id === playerId)
    return i >= 0 ? i : registeredKids.length
  }
  const nextPrice   = packageKidPrice(first.package_price, sibling, registeredKids.length)
  const nextSibling = isSiblingPrice(sibling, registeredKids.length)

  const [showWho, setShowWho]             = useState(false)
  // null = sign-up form closed; otherwise the kids ticked in it.
  const [selected, setSelected]           = useState<Set<string> | null>(null)
  const [reminderEmail, setReminderEmail] = useState(true)  // on by default; parents can untick
  const [reminderSms, setReminderSms]     = useState(false)
  const [errors, setErrors]               = useState<string[]>([])
  const [pending, start]                  = useTransition()

  function openForm(playerId: string) {
    setErrors([])
    setSelected(new Set([playerId]))
  }

  function register(ids: string[], emailOn: boolean, smsOn: boolean, closeOnSuccess: boolean) {
    setErrors([])
    start(async () => {
      const errs: string[] = []
      for (const playerId of ids) {
        const result = await signUpForTrainingSeries(seriesId, playerId, emailOn, smsOn)
        if (result.error) {
          const pl = players.find((p) => p.player_id === playerId)
          errs.push(`${pl?.first_name ?? "Player"}: ${result.error}`)
        } else {
          onBulkSignup(playerId, result.results)
        }
      }
      setErrors(errs)
      if (errs.length === 0 && closeOnSuccess) setSelected(null)
    })
  }

  function cancel(p: (typeof status)[number]) {
    const name = `${p.first_name} ${p.last_name}`
    const n = p.regs.length
    const paidNote = p.paid ? "\n\nYou've already paid — reach out to the coach about a refund." : ""
    if (!confirm(`Cancel ${name}'s registration for ${n === 1 ? "this series" : `all ${n} sessions`}?${paidNote}`)) return
    setErrors([])
    start(async () => {
      const result = await cancelMultipleTrainingSignups(p.regs.map((r) => r.signupId))
      if (result.error) { setErrors([result.error]); return }
      for (const r of p.regs) onCancel(r.sessionId, p.player_id)
    })
  }

  const picked    = selected ? [...selected] : []
  // Kids are registered in this order, so the first one picked takes the next
  // price in line (full, or sibling if a brother or sister is already in).
  const pickedPrices = picked.map((_, i) => packageKidPrice(first.package_price, sibling, registeredKids.length + i))
  const total     = packageFamilyTotal(first.package_price, sibling, registeredKids.length, picked.length)
  const overSpots = picked.length > spotsLeft
  const costLine  = picked.length === 0 ? ""
    : picked.length === 1
      ? pickedPrices[0] ? ` Cost: ${pickedPrices[0]}${nextSibling ? " (sibling price)" : ""}.` : ""
      : total
        ? ` Total: ${total}${new Set(pickedPrices).size > 1 ? ` (${pickedPrices.join(" + ")} with the sibling price)` : ""}.`
        : price ? (siblingSummary(first.package_price, sibling) ? ` Cost: ${pickedPrices.join(", ")}.` : ` Cost: ${price} each.`) : ""

  return (
    <div className="border-b border-gray-200 dark:border-gray-700">
      {/* What you're signing up for — the price is in the header above */}
      <div className="px-5 py-2.5 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800">
        <p className="text-xs text-blue-800 dark:text-blue-200">
          One sign-up covers all {count} dates ·{" "}
          <span className={`font-semibold ${spotsLeft === 0 ? "text-red-600 dark:text-red-400" : ""}`}>
            {spotsLeft === 0 ? "Full" : `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""} left`}
          </span>
          {whoIsIn.length > 0 && (
            <>
              {" · "}
              <button
                type="button"
                onClick={() => setShowWho((v) => !v)}
                aria-expanded={showWho}
                className="font-medium text-blue-700 dark:text-blue-300 underline decoration-dotted underline-offset-2"
              >
                {whoIsIn.length} signed up {showWho ? "▾" : "▸"}
              </button>
            </>
          )}
        </p>
        {showWho && (
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{whoIsIn.join(", ")}</p>
        )}
      </div>

      {/* One row per kid */}
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {status.map((p) => {
          const name = `${p.first_name} ${p.last_name}`
          const registered = p.regs.length > 0
          const kidPrice     = packageKidPrice(first.package_price, sibling, nthOf(p.player_id))
          const kidIsSibling = isSiblingPrice(sibling, nthOf(p.player_id))
          return (
            <div key={p.player_id} className="px-5 py-3 bg-white dark:bg-gray-900">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{name}</span>
                  {registered && (
                    <div className="mt-0.5 space-y-1">
                      <p className="text-xs font-medium text-green-700 dark:text-green-400">
                        ✓ Registered for {p.missing.length === 0 ? `all ${p.regs.length} sessions` : `${p.regs.length} of ${count} sessions`}
                      </p>
                      {p.regs.some((r) => !r.attending) && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Can’t make{" "}
                          {sessions
                            .filter((s) => p.regs.some((r) => r.sessionId === s.id && !r.attending))
                            .map((s) => fmtShortDate(s.session_date))
                            .join(", ")}
                        </p>
                      )}
                      {p.paid ? (
                        <p className="text-xs text-green-700 dark:text-green-400">Paid — thank you!</p>
                      ) : kidPrice ? (
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          Payment due: {kidPrice}{kidIsSibling ? " (sibling price)" : ""}
                          {payMethods.length > 0 && (
                            <>
                              {" · "}
                              {payMethods.map((m, i) => (
                                <Fragment key={i}>
                                  {i > 0 && " · "}
                                  {m.link ? (
                                    <a
                                      href={venmoPayLink(m.link, `${name} - ${first.title}`, packagePriceCents(kidPrice)) ?? m.link}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="font-semibold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                                    >
                                      {payLinkLabel(m)}
                                    </a>
                                  ) : (
                                    <span>{m.label}</span>
                                  )}
                                </Fragment>
                              ))}
                            </>
                          )}
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {registered && p.missing.length > 0 && (
                    <button
                      onClick={() => register([p.player_id], false, false, false)}
                      disabled={pending}
                      className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                    >
                      Add the other {p.missing.length}
                    </button>
                  )}
                  {registered ? (
                    <button
                      onClick={() => cancel(p)}
                      disabled={pending}
                      className="text-xs text-red-500 hover:underline disabled:opacity-50"
                    >
                      Cancel registration
                    </button>
                  ) : selected ? null : spotsLeft === 0 ? (
                    <span className="text-xs font-medium text-red-500">Full</span>
                  ) : (
                    <button
                      onClick={() => openForm(p.player_id)}
                      disabled={pending}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      Sign up{nextPrice ? ` · ${nextPrice}` : ""}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Sign-up form: confirms the whole series, can take several kids at once */}
      {selected && (
        <div className="px-5 py-4 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 space-y-3">
          {unregistered.length > 1 && (
            <div>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Who&rsquo;s signing up?</p>
              <div className="space-y-1.5">
                {unregistered.map((p) => (
                  <label key={p.player_id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(p.player_id)}
                      onChange={(e) => setSelected((prev) => {
                        const next = new Set(prev ?? [])
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
          )}

          <p className="text-xs text-gray-600 dark:text-gray-400">
            {picked.length === 1
              ? `${players.find((p) => p.player_id === picked[0])?.first_name ?? "Your player"} will be registered for`
              : "Each player will be registered for"}{" "}
            all {count} sessions ({fmtShortDate(first.session_date)} – {fmtShortDate(sessions[count - 1].session_date)}).
            {costLine}
          </p>

          <div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">
              We’ll email a reminder the day before — untick to skip it.
            </p>
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
          </div>
          {reminderSms && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
              By checking &ldquo;Text reminder&rdquo; you agree to receive recurring
              automated SMS reminders from CS Sports AZ for each training session
              you register for. Msg freq varies. Msg&amp;Data rates may apply.
              Reply STOP to opt out, HELP for help. See{" "}
              <a href="/privacy" target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 underline">Privacy Policy</a>
              {" "}and{" "}
              <a href="/sms-terms" target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 underline">SMS Terms</a>.
            </p>
          )}

          {overSpots && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Only {spotsLeft} spot{spotsLeft !== 1 ? "s" : ""} left — untick {picked.length - spotsLeft === 1 ? "a player" : `${picked.length - spotsLeft} players`}.
            </p>
          )}
          {errors.map((err, i) => <p key={i} className="text-xs text-red-500">{err}</p>)}

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => register(picked, reminderEmail, reminderSms, true)}
              disabled={pending || picked.length === 0 || overSpots}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {pending
                ? "Signing up…"
                : picked.length > 1
                  ? `Register ${picked.length} players for all ${count}`
                  : `Register for all ${count} sessions`}
            </button>
            <button
              onClick={() => { setSelected(null); setErrors([]) }}
              className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!selected && errors.map((err, i) => <p key={i} className="px-5 pb-2 text-xs text-red-500">{err}</p>)}
    </div>
  )
}

// ── SeriesAbout ───────────────────────────────────────────────────────────────
// Photo thumbnail + description clamped to two lines; "More" shows it all.

function SeriesAbout({
  imageUrl, description, notes, onOpenImage,
}: {
  imageUrl:    string | null
  description: string | null
  notes:       string | null
  onOpenImage: (url: string) => void
}) {
  const [more, setMore] = useState(false)
  const long = (description?.length ?? 0) > 110 || (notes?.length ?? 0) > 70
  return (
    <div className="px-5 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex items-start gap-3">
      {imageUrl && (
        <button type="button" onClick={() => onOpenImage(imageUrl)} className="shrink-0" aria-label="View photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="h-14 w-14 rounded-lg object-cover cursor-zoom-in" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        {description && (
          <p className={`text-sm text-gray-600 dark:text-gray-400 ${more ? "" : "line-clamp-2"}`}>{description}</p>
        )}
        {notes && (
          <p className={`text-xs text-gray-400 dark:text-gray-500 mt-1 italic ${more ? "" : "line-clamp-1"}`}>{notes}</p>
        )}
        {long && (
          <button
            type="button"
            onClick={() => setMore((v) => !v)}
            aria-expanded={more}
            className="mt-0.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            {more ? "Less" : "More"}
          </button>
        )}
      </div>
    </div>
  )
}

// ── DateList ──────────────────────────────────────────────────────────────────
// The next few dates, one line each; "Show all" for the rest.

const DATES_SHOWN = 4

function DateList({
  sessions, isPackage, anyRegistered, onAttendance,
}: {
  sessions:      TrainingSessionForParent[]
  isPackage:     boolean
  anyRegistered: boolean
  onAttendance:  (sessionId: string, playerId: string, attending: boolean) => void
}) {
  const [showAll, setShowAll] = useState(false)
  // Not worth a "Show all" for just one more date.
  const collapsible = sessions.length > DATES_SHOWN + 1
  const shown = showAll || !collapsible ? sessions : sessions.slice(0, DATES_SHOWN)

  return (
    <div className="bg-white dark:bg-gray-900">
      <div className="px-5 pt-3 pb-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {isPackage ? "Included dates" : "Dates"} · {sessions.length}
        </p>
        {isPackage && anyRegistered && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Tap <span className="font-medium">Going</span> on a date you’ll miss — the price stays the same.
          </p>
        )}
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {shown.map((s) => (
          <SimpleDateCard
            key={s.id}
            session={s}
            compact={isPackage}
            onAttendance={isPackage ? (playerId, attending) => onAttendance(s.id, playerId, attending) : undefined}
          />
        ))}
      </div>
      {collapsible && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="w-full border-t border-gray-100 dark:border-gray-800 px-5 py-2.5 text-left text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/60"
        >
          {showAll ? "Show fewer dates ▴" : `Show all ${sessions.length} dates ▾`}
        </button>
      )}
    </div>
  )
}

// ── SimpleDateCard ────────────────────────────────────────────────────────────
// One line: date · time (· spots left). Tap it for the location and who's in.

function SimpleDateCard({
  session, compact = false, onAttendance,
}: {
  session:       TrainingSessionForParent
  compact?:      boolean
  /** Whole series: show a Going toggle per registered kid on this date. */
  onAttendance?: (playerId: string, attending: boolean) => void
}) {
  const time      = fmtTime(session.session_time)
  const endTime   = fmtTime(session.session_end_time)
  const openSlots = session.max_players - session.total_signups
  const isFull    = openSlots <= 0
  const mapTarget = session.location_address || session.location

  const kids     = onAttendance ? session.players.filter((p) => p.signup_id) : []
  const allOut   = kids.length > 0 && kids.every((k) => !k.attending)
  const [open, setOpen]   = useState(false)
  const [pending, start]  = useTransition()
  const [error, setError] = useState<string | null>(null)
  const hasDetails = !!session.location || (!compact && session.signedUpPlayers.length > 0)

  function toggle(kid: EligiblePlayer) {
    const next = !kid.attending
    setError(null)
    onAttendance!(kid.player_id, next) // optimistic
    start(async () => {
      const result = await setTrainingAttendance([kid.signup_id!], next)
      if (result.error) {
        onAttendance!(kid.player_id, !next)
        setError(result.error)
      }
    })
  }

  const line = (
    <>
      <span className="w-2.5 shrink-0 text-[10px] text-gray-400 dark:text-gray-500" aria-hidden>
        {hasDetails ? (open ? "▾" : "▸") : ""}
      </span>
      <span className="text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">{fmtRowDate(session.session_date)}</span>
      {time && (
        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {time}{endTime ? ` – ${endTime}` : ""}
        </span>
      )}
      {!compact && (
        <span className={`text-xs font-medium whitespace-nowrap ${isFull ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
          {isFull ? "Full" : `${openSlots} left`}
        </span>
      )}
    </>
  )

  return (
    <div className="px-5 py-2 bg-white dark:bg-gray-900">
      <div className="flex items-center justify-between gap-3">
        {hasDetails ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={`min-w-0 flex-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1 text-left ${allOut ? "opacity-50" : ""}`}
          >
            {line}
          </button>
        ) : (
          <div className={`min-w-0 flex-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1 ${allOut ? "opacity-50" : ""}`}>{line}</div>
        )}
        {kids.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5 shrink-0">
            {kids.map((k) => (
              <button
                key={k.player_id}
                type="button"
                onClick={() => toggle(k)}
                disabled={pending}
                aria-pressed={k.attending}
                title={k.attending ? `Tap if ${k.first_name} can’t make this date` : `Tap if ${k.first_name} can make it after all`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-60 ${
                  k.attending
                    ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50"
                    : "border-gray-300 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                }`}
              >
                <span
                  aria-hidden
                  className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border text-[10px] leading-none ${
                    k.attending
                      ? "border-green-600 bg-green-600 text-white dark:border-green-500 dark:bg-green-500"
                      : "border-gray-400 text-gray-500 dark:border-gray-500 dark:text-gray-400"
                  }`}
                >
                  {k.attending ? "✓" : "✕"}
                </span>
                {kids.length > 1 && <span className="font-medium">{k.first_name}</span>}
                {k.attending ? "Going" : "Can’t make it"}
              </button>
            ))}
          </div>
        )}
      </div>

      {open && (
        <div className="ml-[18px] pb-1 space-y-0.5">
          {session.location && (
            <a
              href={mapsLink(mapTarget!)}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              {session.location}{session.location_address ? ` · ${session.location_address}` : ""} ↗
            </a>
          )}
          {!compact && session.signedUpPlayers.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium">Signed up:</span>{" "}
              {session.signedUpPlayers.map((p) => `${p.first_name} ${p.last_name}`).join(", ")}
            </p>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
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
  // Reminder opts default off — neither email nor SMS is required to register.
  const [reminderEmail, setReminderEmail]     = useState(true)  // on by default; parents can untick
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
        const result = await bulkSignUpForTraining(sessionIds, playerId, null, reminderEmail, reminderSms)
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

      <div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">
          We’ll email a reminder the day before — untick to skip it.
        </p>
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
            effectiveSessionCount === 0
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
