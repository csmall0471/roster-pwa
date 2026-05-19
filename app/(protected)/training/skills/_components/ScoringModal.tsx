"use client"

import { useState, useTransition } from "react"
import type { SkillsAttempt } from "../actions"
import { upsertSkillsAttempt } from "../actions"
import type { PlayerOption } from "./SkillsHub"
import SkillsCourseTimer from "./SkillsCourseTimer"
import FreeThrowTracker from "./FreeThrowTracker"
import HotShotsBoard, { type HotShotsData } from "./HotShotsBoard"

type Tab = "course" | "freethrows" | "hotshots"

type Props = {
  player:         PlayerOption
  sessionId:      string
  initialAttempt: SkillsAttempt | null
  onSaved:        (attempt: SkillsAttempt) => void
  onClose:        () => void
}

export default function ScoringModal({ player, sessionId, initialAttempt, onSaved, onClose }: Props) {
  const [tab, setTab]           = useState<Tab>("course")
  const [savingTab, setSavingTab] = useState<Tab | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function save(data: Parameters<typeof upsertSkillsAttempt>[2]) {
    const { attempt, error: err } = await upsertSkillsAttempt(sessionId, player.id, data)
    if (err) { setError(err); return }
    onSaved(attempt!)
    setError(null)
  }

  function handleSaveCourse(ms: number) {
    setSavingTab("course")
    startTransition(async () => {
      await save({ course_time_ms: ms })
      setSavingTab(null)
    })
  }

  function handleSaveFT(makes: number) {
    setSavingTab("freethrows")
    startTransition(async () => {
      await save({ free_throw_makes: makes })
      setSavingTab(null)
    })
  }

  function handleSaveHotShots(data: HotShotsData) {
    setSavingTab("hotshots")
    startTransition(async () => {
      await save(data)
      setSavingTab(null)
    })
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "course",     label: "Skills Course" },
    { id: "freethrows", label: "Free Throws" },
    { id: "hotshots",   label: "Hot Shots" },
  ]

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {player.first_name} {player.last_name}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Scoring session</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 shrink-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                tab === t.id
                  ? "border-b-2 border-blue-600 text-blue-600 dark:text-blue-400"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {t.label}
              {t.id === "course" && initialAttempt?.course_time_ms != null && (
                <span className="ml-1 text-green-500">✓</span>
              )}
              {t.id === "freethrows" && initialAttempt?.free_throw_makes != null && (
                <span className="ml-1 text-green-500">✓</span>
              )}
              {t.id === "hotshots" && initialAttempt && (
                initialAttempt.hot_shots_8pt + initialAttempt.hot_shots_7pt + initialAttempt.hot_shots_5pt +
                initialAttempt.hot_shots_3pt + initialAttempt.hot_shots_2pt > 0
              ) && (
                <span className="ml-1 text-green-500">✓</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 mb-4">{error}</p>
          )}

          {tab === "course" && (
            <SkillsCourseTimer
              initialMs={initialAttempt?.course_time_ms ?? null}
              onSave={handleSaveCourse}
              saving={savingTab === "course" && isPending}
            />
          )}

          {tab === "freethrows" && (
            <FreeThrowTracker
              initialMakes={initialAttempt?.free_throw_makes ?? null}
              onSave={handleSaveFT}
              saving={savingTab === "freethrows" && isPending}
            />
          )}

          {tab === "hotshots" && (
            <HotShotsBoard
              initial={{
                hot_shots_8pt: initialAttempt?.hot_shots_8pt ?? 0,
                hot_shots_7pt: initialAttempt?.hot_shots_7pt ?? 0,
                hot_shots_5pt: initialAttempt?.hot_shots_5pt ?? 0,
                hot_shots_3pt: initialAttempt?.hot_shots_3pt ?? 0,
                hot_shots_2pt: initialAttempt?.hot_shots_2pt ?? 0,
              }}
              onSave={handleSaveHotShots}
              saving={savingTab === "hotshots" && isPending}
            />
          )}
        </div>
      </div>
    </div>
  )
}
