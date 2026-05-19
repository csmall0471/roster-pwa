"use client"

import { useState } from "react"
import type { SkillsSession, SkillsAttempt } from "@/app/(protected)/training/skills/actions"
import { hotShotsTotal, formatTime } from "@/app/(protected)/training/skills/utils"

type Player = { id: string; first_name: string; last_name: string }

type Props = {
  players:  Player[]
  sessions: SkillsSession[]
  attempts: SkillsAttempt[]
}

function TrendArrow({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const last  = values[values.length - 1]
  const prev  = values[values.length - 2]
  if (last > prev) return <span className="text-green-500 text-xs">▲</span>
  if (last < prev) return <span className="text-red-400 text-xs">▼</span>
  return <span className="text-gray-400 text-xs">—</span>
}

// Lower time = better for course; higher = better for everything else
function CourseTrend({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const last = values[values.length - 1]
  const prev = values[values.length - 2]
  if (last < prev) return <span className="text-green-500 text-xs">▲</span>
  if (last > prev) return <span className="text-red-400 text-xs">▼</span>
  return <span className="text-gray-400 text-xs">—</span>
}

export default function ParentSkillsView({ players, sessions, attempts }: Props) {
  const [selectedPlayer, setSelectedPlayer] = useState(players[0]?.id ?? "")

  const player = players.find((p) => p.id === selectedPlayer)

  // Attempts for this player, ordered by session date
  const playerAttempts = sessions
    .map((s) => {
      const a = attempts.find(
        (at) => at.player_id === selectedPlayer && at.skills_session_id === s.id
      )
      return { session: s, attempt: a ?? null }
    })
    .filter((row) => row.attempt !== null) as Array<{ session: SkillsSession; attempt: SkillsAttempt }>

  const courseTimes = playerAttempts
    .filter((r) => r.attempt.course_time_ms != null)
    .map((r) => r.attempt.course_time_ms!)

  const ftScores = playerAttempts
    .filter((r) => r.attempt.free_throw_makes != null)
    .map((r) => r.attempt.free_throw_makes!)

  const hotShotsScores = playerAttempts
    .filter((r) => hotShotsTotal(r.attempt) > 0)
    .map((r) => hotShotsTotal(r.attempt))

  const bestCourseMs = courseTimes.length > 0 ? Math.min(...courseTimes) : null
  const bestFT       = ftScores.length > 0 ? Math.max(...ftScores) : null
  const bestHotShots = hotShotsScores.length > 0 ? Math.max(...hotShotsScores) : null

  return (
    <div className="space-y-6">
      {/* Player selector (only shown if multiple kids) */}
      {players.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {players.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPlayer(p.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedPlayer === p.id
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {p.first_name} {p.last_name}
            </button>
          ))}
        </div>
      )}

      {player && (
        <>
          {/* Personal bests */}
          {(bestCourseMs != null || bestFT != null || bestHotShots != null) && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Personal Bests — {player.first_name}
              </h2>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-3 text-center">
                  <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">Skills Course</p>
                  <p className="text-lg font-bold text-purple-800 dark:text-purple-300 mt-1">
                    {bestCourseMs != null ? formatTime(bestCourseMs) : "—"}
                  </p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 text-center">
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Free Throws</p>
                  <p className="text-lg font-bold text-blue-800 dark:text-blue-300 mt-1">
                    {bestFT != null ? `${bestFT}/10` : "—"}
                  </p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-3 text-center">
                  <p className="text-xs text-green-600 dark:text-green-400 font-medium">Hot Shots</p>
                  <p className="text-lg font-bold text-green-800 dark:text-green-300 mt-1">
                    {bestHotShots != null ? `${bestHotShots}pts` : "—"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Session history */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              History
            </h2>
            {playerAttempts.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No scores recorded yet for {player.first_name}.
              </p>
            ) : (
              <div className="space-y-3">
                {playerAttempts.map(({ session, attempt }) => {
                  const hs = hotShotsTotal(attempt)
                  return (
                    <div
                      key={session.id}
                      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{session.name}</p>
                          <p className="text-xs text-gray-400">{session.session_date}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Course</p>
                          <p className="text-base font-bold text-gray-900 dark:text-white">
                            {attempt.course_time_ms != null ? (
                              <>
                                {formatTime(attempt.course_time_ms)}{" "}
                                <CourseTrend values={courseTimes.filter((_, i) => {
                                  const rows = playerAttempts.filter((r) => r.attempt.course_time_ms != null)
                                  const idx = rows.findIndex((r) => r.session.id === session.id)
                                  return i <= idx
                                })} />
                              </>
                            ) : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Free Throws</p>
                          <p className="text-base font-bold text-gray-900 dark:text-white">
                            {attempt.free_throw_makes != null ? (
                              <>
                                {attempt.free_throw_makes}/10{" "}
                                <TrendArrow values={ftScores.filter((_, i) => {
                                  const rows = playerAttempts.filter((r) => r.attempt.free_throw_makes != null)
                                  const idx = rows.findIndex((r) => r.session.id === session.id)
                                  return i <= idx
                                })} />
                              </>
                            ) : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Hot Shots</p>
                          <p className="text-base font-bold text-gray-900 dark:text-white">
                            {hs > 0 ? (
                              <>
                                {hs}pts{" "}
                                <TrendArrow values={hotShotsScores.filter((_, i) => {
                                  const rows = playerAttempts.filter((r) => hotShotsTotal(r.attempt) > 0)
                                  const idx = rows.findIndex((r) => r.session.id === session.id)
                                  return i <= idx
                                })} />
                              </>
                            ) : "—"}
                          </p>
                        </div>
                      </div>
                      {hs > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 grid grid-cols-5 gap-1 text-center">
                          {[
                            { label: "8pt", val: attempt.hot_shots_8pt, color: "text-purple-600 dark:text-purple-400" },
                            { label: "7pt", val: attempt.hot_shots_7pt, color: "text-blue-600 dark:text-blue-400" },
                            { label: "5pt", val: attempt.hot_shots_5pt, color: "text-cyan-600 dark:text-cyan-400" },
                            { label: "3pt", val: attempt.hot_shots_3pt, color: "text-green-600 dark:text-green-400" },
                            { label: "2pt", val: attempt.hot_shots_2pt, color: "text-amber-600 dark:text-amber-400" },
                          ].map((pos) => (
                            <div key={pos.label}>
                              <p className={`text-xs font-semibold ${pos.color}`}>{pos.label}</p>
                              <p className="text-xs text-gray-700 dark:text-gray-300">{pos.val} makes</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* No scores at all */}
          {playerAttempts.length === 0 && sessions.length > 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
              Scores will appear here once your coach records them.
            </p>
          )}
          {sessions.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
              No skills sessions scheduled yet.
            </p>
          )}
        </>
      )}
    </div>
  )
}
