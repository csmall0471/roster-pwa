"use client"

import { useState, useEffect } from "react"

const TOTAL = 10

type Props = {
  initialMakes: number | null
  onSave:       (makes: number) => void
  saving:       boolean
}

// null = not yet attempted, true = made, false = missed
type ShotResult = boolean | null

export default function FreeThrowTracker({ initialMakes, onSave, saving }: Props) {
  const [shots, setShots] = useState<ShotResult[]>(() => {
    if (initialMakes == null) return Array(TOTAL).fill(null)
    return [
      ...Array(initialMakes).fill(true),
      ...Array(TOTAL - initialMakes).fill(false),
    ]
  })

  useEffect(() => {
    if (initialMakes == null) {
      setShots(Array(TOTAL).fill(null))
    } else {
      setShots([
        ...Array(initialMakes).fill(true),
        ...Array(TOTAL - initialMakes).fill(false),
      ])
    }
  }, [initialMakes])

  const attempted = shots.filter((s) => s !== null).length
  const makes     = shots.filter((s) => s === true).length
  const isDone    = attempted === TOTAL

  function recordShot(made: boolean) {
    if (isDone) return
    setShots((prev) => {
      const next = [...prev]
      const idx = next.findIndex((s) => s === null)
      if (idx === -1) return prev
      next[idx] = made
      return next
    })
  }

  function undo() {
    setShots((prev) => {
      const next = [...prev]
      // Find last attempted shot
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i] !== null) { next[i] = null; return next }
      }
      return prev
    })
  }

  function reset() {
    setShots(Array(TOTAL).fill(null))
  }

  return (
    <div className="space-y-6">
      {/* Score display */}
      <div className="text-center">
        <div className="text-6xl font-bold text-gray-900 dark:text-white">
          {makes}
          <span className="text-3xl text-gray-400 font-normal">/{TOTAL}</span>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {isDone ? "Complete" : `${attempted} of ${TOTAL} attempted`}
        </p>
      </div>

      {/* Shot dots */}
      <div className="flex gap-2 justify-center flex-wrap">
        {shots.map((s, i) => (
          <div
            key={i}
            className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-lg font-bold transition-colors ${
              s === true
                ? "bg-green-500 border-green-500 text-white"
                : s === false
                ? "bg-red-500 border-red-500 text-white"
                : "bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600"
            }`}
          >
            {s === true ? "✓" : s === false ? "✗" : ""}
          </div>
        ))}
      </div>

      {/* Action buttons */}
      {!isDone ? (
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => recordShot(true)}
            className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-lg"
          >
            Made
          </button>
          <button
            onClick={() => recordShot(false)}
            className="px-8 py-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold text-lg"
          >
            Missed
          </button>
        </div>
      ) : (
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => onSave(makes)}
            disabled={saving}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-semibold"
          >
            {saving ? "Saving…" : "Save score"}
          </button>
        </div>
      )}

      <div className="flex gap-4 justify-center">
        {attempted > 0 && (
          <button onClick={undo} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
            Undo last shot
          </button>
        )}
        {attempted > 0 && (
          <button onClick={reset} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
            Reset
          </button>
        )}
        {isDone && (
          <button onClick={reset} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
            Retry
          </button>
        )}
      </div>

      {initialMakes != null && attempted === 0 && (
        <p className="text-center text-sm text-gray-400">
          Previously saved: {initialMakes}/{TOTAL} — tap Made/Missed to record a new attempt
        </p>
      )}
    </div>
  )
}
