"use client"

import { useState, useMemo, useTransition } from "react"
import type { SkillsSession, SkillsAttempt } from "../actions"
import { createSkillsSession, deleteSkillsSession } from "../actions"
import { hotShotsTotal, formatTime } from "../utils"
import ScoringModal from "./ScoringModal"

export type PlayerOption = {
  id:         string
  first_name: string
  last_name:  string
}

type Props = {
  initialSessions: SkillsSession[]
  initialAttempts: SkillsAttempt[]
  players:         PlayerOption[]
}

export default function SkillsHub({ initialSessions, initialAttempts, players }: Props) {
  const [sessions, setSessions]               = useState(initialSessions)
  const [attempts, setAttempts]               = useState(initialAttempts)
  const [selectedSessionId, setSelectedSession] = useState<string | null>(
    initialSessions[0]?.id ?? null
  )
  const [scoringPlayer, setScoringPlayer]     = useState<{ playerId: string; sessionId: string } | null>(null)
  const [showNewForm, setShowNewForm]         = useState(false)
  const [newName, setNewName]                 = useState("")
  const [newDate, setNewDate]                 = useState(new Date().toISOString().split("T")[0])
  const [newNotes, setNewNotes]               = useState("")
  const [isPending, startTransition]          = useTransition()
  const [error, setError]                     = useState<string | null>(null)

  // Map attempt by sessionId+playerId for fast lookup
  const attemptMap = useMemo(() => {
    const m = new Map<string, SkillsAttempt>()
    for (const a of attempts) m.set(`${a.skills_session_id}:${a.player_id}`, a)
    return m
  }, [attempts])

  const selectedSession = sessions.find((s) => s.id === selectedSessionId) ?? null

  function handleAttemptSaved(attempt: SkillsAttempt) {
    setAttempts((prev) => {
      const key = `${attempt.skills_session_id}:${attempt.player_id}`
      const existing = prev.find((a) => `${a.skills_session_id}:${a.player_id}` === key)
      if (existing) return prev.map((a) => (a.id === existing.id ? attempt : a))
      return [...prev, attempt]
    })
  }

  function handleCreateSession() {
    if (!newName.trim()) return
    startTransition(async () => {
      const { session, error: err } = await createSkillsSession({
        name:         newName.trim(),
        session_date: newDate,
        notes:        newNotes.trim() || null,
      })
      if (err) { setError(err); return }
      setSessions((prev) => [session!, ...prev])
      setSelectedSession(session!.id)
      setShowNewForm(false)
      setNewName("")
      setNewNotes("")
      setError(null)
    })
  }

  function handleDeleteSession(id: string) {
    if (!confirm("Delete this skills session and all its scores?")) return
    startTransition(async () => {
      const { error: err } = await deleteSkillsSession(id)
      if (err) { setError(err); return }
      setSessions((prev) => prev.filter((s) => s.id !== id))
      setAttempts((prev) => prev.filter((a) => a.skills_session_id !== id))
      if (selectedSessionId === id) setSelectedSession(sessions.find((s) => s.id !== id)?.id ?? null)
    })
  }

  const scoringAttempt = scoringPlayer
    ? (attemptMap.get(`${scoringPlayer.sessionId}:${scoringPlayer.playerId}`) ?? null)
    : null

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Session selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={selectedSessionId ?? ""}
          onChange={(e) => setSelectedSession(e.target.value || null)}
          className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white min-w-[220px]"
        >
          {sessions.length === 0 && <option value="">No sessions yet</option>}
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.session_date} — {s.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowNewForm((v) => !v)}
          className="text-sm px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
        >
          + New Session
        </button>
        {selectedSession && (
          <button
            onClick={() => handleDeleteSession(selectedSession.id)}
            disabled={isPending}
            className="text-sm px-3 py-2 text-red-600 dark:text-red-400 hover:underline"
          >
            Delete session
          </button>
        )}
      </div>

      {/* New session form */}
      {showNewForm && (
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3 max-w-md">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">New Skills Session</h3>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Session name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. June 15 Practice"
              className="mt-1 w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Date</label>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="mt-1 w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Notes (optional)</label>
            <input
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Any notes about this session"
              className="mt-1 w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreateSession}
              disabled={!newName.trim() || isPending}
              className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium"
            >
              Create
            </button>
            <button
              onClick={() => setShowNewForm(false)}
              className="text-sm px-4 py-2 text-gray-600 dark:text-gray-400 hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Player roster for selected session */}
      {selectedSession ? (
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3">
            {selectedSession.name} — {selectedSession.session_date}
          </h2>
          {players.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No players found.</p>
          ) : (
            <div className="space-y-2">
              {players.map((player) => {
                const attempt = attemptMap.get(`${selectedSession.id}:${player.id}`) ?? null
                const hasAny = attempt && (
                  attempt.course_time_ms != null ||
                  attempt.free_throw_makes != null ||
                  hotShotsTotal(attempt) > 0
                )
                return (
                  <div
                    key={player.id}
                    className="flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {player.first_name} {player.last_name}
                      </p>
                      {hasAny && (
                        <div className="flex gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {attempt!.course_time_ms != null && (
                            <span>Course: {formatTime(attempt!.course_time_ms)}</span>
                          )}
                          {attempt!.free_throw_makes != null && (
                            <span>FT: {attempt!.free_throw_makes}/10</span>
                          )}
                          {hotShotsTotal(attempt!) > 0 && (
                            <span>Hot Shots: {hotShotsTotal(attempt!)}pts</span>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setScoringPlayer({ playerId: player.id, sessionId: selectedSession.id })}
                      className={`text-sm px-3 py-1.5 rounded-lg font-medium ${
                        hasAny
                          ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50"
                          : "bg-blue-600 hover:bg-blue-700 text-white"
                      }`}
                    >
                      {hasAny ? "Edit scores" : "Score"}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Create a session above to start tracking scores.
        </p>
      )}

      {/* Scoring modal */}
      {scoringPlayer && (
        <ScoringModal
          player={players.find((p) => p.id === scoringPlayer.playerId)!}
          sessionId={scoringPlayer.sessionId}
          initialAttempt={scoringAttempt}
          onSaved={handleAttemptSaved}
          onClose={() => setScoringPlayer(null)}
        />
      )}
    </div>
  )
}
