"use client"

import { useState, useTransition } from "react"
import type { SkillsAttempt, CourseSplit, ShotLogEntry } from "../actions"
import { upsertSkillsAttempt } from "../actions"
import type { PlayerOption } from "./SkillsHub"
import CourseScorer from "./CourseScorer"
import HotShotsScorer from "./HotShotsScorer"
import FreeThrowScorer from "./FreeThrowScorer"

type Tab = "course" | "freethrows" | "hotshots"

type Props = {
  player:         PlayerOption
  sessionId:      string
  initialAttempt: SkillsAttempt | null
  onSaved:        (attempt: SkillsAttempt) => void
  onClose:        () => void
}

export default function FullScreenScorer({ player, sessionId, initialAttempt, onSaved, onClose }: Props) {
  const [tab, setTab]             = useState<Tab>("course")
  const [attempt, setAttempt]     = useState<SkillsAttempt | null>(initialAttempt)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [, startTransition]       = useTransition()

  async function save(data: Parameters<typeof upsertSkillsAttempt>[2]) {
    setSaving(true)
    setError(null)
    const { attempt: saved, error: err } = await upsertSkillsAttempt(sessionId, player.id, data)
    setSaving(false)
    if (err) { setError(err); return }
    setAttempt(saved)
    onSaved(saved!)
  }

  const tabs: { id: Tab; label: string; done: boolean }[] = [
    {
      id: "course",
      label: "Course",
      done: attempt?.course_time_ms != null,
    },
    {
      id: "freethrows",
      label: "Free Throws",
      done: attempt?.free_throw_makes != null,
    },
    {
      id: "hotshots",
      label: "Hot Shots",
      done: (attempt?.hot_shots_log?.length ?? 0) > 0,
    },
  ]

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 bg-gray-900 border-b border-gray-800 shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white"
        >
          <span className="text-lg leading-none">←</span> Back
        </button>
        <span className="text-sm font-semibold text-white">
          {player.first_name} {player.last_name}
        </span>
        <div className="w-14" /> {/* spacer */}
      </div>

      {/* Tab bar */}
      <div className="flex bg-gray-900 border-b border-gray-800 shrink-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
              tab === t.id
                ? "border-b-2 border-orange-500 text-orange-400"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {t.label}
            {t.done && <span className="text-green-400">✓</span>}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-900/50 text-red-300 text-xs shrink-0">{error}</div>
      )}

      {/* Content — full remaining height */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "course" && (
          <CourseScorer
            initialTimeMs={attempt?.course_time_ms ?? null}
            initialSplits={attempt?.course_splits ?? null}
            saving={saving}
            onSave={(timeMs, splits) => save({ course_time_ms: timeMs, course_splits: splits })}
          />
        )}
        {tab === "freethrows" && (
          <FreeThrowScorer
            initialMakes={attempt?.free_throw_makes ?? null}
            saving={saving}
            onSave={(makes) => save({ free_throw_makes: makes })}
          />
        )}
        {tab === "hotshots" && (
          <HotShotsScorer
            initialLog={attempt?.hot_shots_log ?? null}
            saving={saving}
            onSave={(log, makes) => save({ hot_shots_log: log, ...makes })}
          />
        )}
      </div>
    </div>
  )
}
