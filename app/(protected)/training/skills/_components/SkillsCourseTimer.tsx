"use client"

import { useState, useEffect, useRef } from "react"
import { formatTime } from "../utils"

type Props = {
  initialMs: number | null
  onSave:    (ms: number) => void
  saving:    boolean
}

export default function SkillsCourseTimer({ initialMs, onSave, saving }: Props) {
  const [status, setStatus]     = useState<"idle" | "running" | "stopped">("idle")
  const [elapsed, setElapsed]   = useState(0)
  const [savedMs, setSavedMs]   = useState<number | null>(initialMs)
  const startRef                = useRef<number | null>(null)
  const rafRef                  = useRef<number | null>(null)

  useEffect(() => {
    setSavedMs(initialMs)
  }, [initialMs])

  function tick() {
    if (startRef.current == null) return
    setElapsed(performance.now() - startRef.current)
    rafRef.current = requestAnimationFrame(tick)
  }

  function handleStart() {
    startRef.current = performance.now() - elapsed
    setStatus("running")
    rafRef.current = requestAnimationFrame(tick)
  }

  function handleStop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    setStatus("stopped")
  }

  function handleReset() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    setElapsed(0)
    startRef.current = null
    setStatus("idle")
  }

  function handleSave() {
    const ms = Math.round(elapsed)
    setSavedMs(ms)
    onSave(ms)
    handleReset()
  }

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  const displayMs = status === "idle" && savedMs != null ? savedMs : elapsed

  return (
    <div className="space-y-4">
      {/* Timer display */}
      <div className="bg-gray-900 dark:bg-black rounded-2xl p-8 text-center">
        <div className="text-5xl font-mono font-bold text-white tracking-wider">
          {formatTime(displayMs)}
        </div>
        {status === "idle" && savedMs != null && (
          <p className="text-xs text-gray-400 mt-2">Saved time</p>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-3 justify-center">
        {status === "idle" && (
          <button
            onClick={handleStart}
            className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-lg"
          >
            Start
          </button>
        )}
        {status === "running" && (
          <button
            onClick={handleStop}
            className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold text-lg"
          >
            Stop
          </button>
        )}
        {status === "stopped" && (
          <>
            <button
              onClick={handleReset}
              className="px-5 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-xl font-medium"
            >
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-semibold"
            >
              {saving ? "Saving…" : "Save time"}
            </button>
          </>
        )}
        {status !== "idle" && status !== "stopped" && (
          <button
            onClick={handleReset}
            className="px-5 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-xl font-medium"
          >
            Reset
          </button>
        )}
      </div>

      {savedMs != null && status === "idle" && (
        <div className="text-center">
          <button
            onClick={() => { setElapsed(0); setSavedMs(null) }}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline"
          >
            Clear saved time
          </button>
        </div>
      )}
    </div>
  )
}
