"use client"

import { useState, useEffect } from "react"

const TOTAL = 10

type Props = {
  initialMakes: number | null
  saving:       boolean
  onSave:       (makes: number) => void
}

type Result = "make" | "miss" | null

export default function FreeThrowScorer({ initialMakes, saving, onSave }: Props) {
  const [shots, setShots] = useState<Result[]>(() => {
    if (initialMakes == null) return Array(TOTAL).fill(null)
    return [
      ...Array(initialMakes).fill("make"),
      ...Array(TOTAL - initialMakes).fill("miss"),
    ] as Result[]
  })

  useEffect(() => {
    if (initialMakes == null) setShots(Array(TOTAL).fill(null))
    else setShots([
      ...Array(initialMakes).fill("make"),
      ...Array(TOTAL - initialMakes).fill("miss"),
    ] as Result[])
  }, [initialMakes])

  const attempted  = shots.filter((s) => s !== null).length
  const makes      = shots.filter((s) => s === "make").length
  const isDone     = attempted === TOTAL
  const nextIdx    = shots.findIndex((s) => s === null)

  function record(result: "make" | "miss") {
    if (isDone) return
    setShots((prev) => {
      const next = [...prev]
      const idx = next.findIndex((s) => s === null)
      if (idx === -1) return prev
      next[idx] = result
      return next
    })
  }

  function undo() {
    setShots((prev) => {
      const next = [...prev]
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
    <div className="h-full flex flex-col bg-gray-950 overflow-hidden">

      {/* SVG Court — free throw focused */}
      <div className="flex-1 min-h-0 relative flex items-center justify-center">
        <svg
          viewBox="0 0 390 420"
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Court surface */}
          <rect x="0" y="0" width="390" height="420" fill="#c8a96e" />
          <rect x="6" y="6" width="378" height="408" fill="none" stroke="white" strokeWidth="3" />

          {/* Key */}
          <rect x="135" y="6" width="120" height="280" fill="rgba(180,120,40,0.35)" stroke="white" strokeWidth="2" />

          {/* Free throw line */}
          <line x1="135" y1="210" x2="255" y2="210" stroke="white" strokeWidth="3" />

          {/* Free throw circle (full) */}
          <circle cx="195" cy="210" r="60" fill="none" stroke="white" strokeWidth="2" />

            {/* Lane markings */}
          <line x1="135" y1="240" x2="155" y2="240" stroke="white" strokeWidth="2" />
          <line x1="235" y1="240" x2="255" y2="240" stroke="white" strokeWidth="2" />
          <line x1="135" y1="270" x2="155" y2="270" stroke="white" strokeWidth="2" />
          <line x1="235" y1="270" x2="255" y2="270" stroke="white" strokeWidth="2" />

          {/* Backboard */}
          <rect x="160" y="6" width="70" height="10" fill="none" stroke="white" strokeWidth="3" />

          {/* Rim */}
          <circle cx="195" cy="32" r="16" fill="none" stroke="#ef4444" strokeWidth="3" />

          {/* Backboard support */}
          <line x1="195" y1="16" x2="195" y2="32" stroke="white" strokeWidth="1.5" strokeDasharray="3,2" />

          {/* "FREE THROW LINE" label */}
          <text x="310" y="214" textAnchor="start" fill="rgba(255,255,255,0.6)" fontSize="10" transform="rotate(-90,310,210)">FREE THROW LINE</text>

          {/* Player position indicator at free throw line */}
          <ellipse cx="195" cy="215" rx="12" ry="6" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />

          {/* Attempt dots (visual only — bottom strip) */}
          {shots.map((s, i) => {
            const x = 35 + i * 32
            const y = 380
            return (
              <g key={i}>
                <circle
                  cx={x}
                  cy={y}
                  r={13}
                  fill={s === "make" ? "#16a34a" : s === "miss" ? "#dc2626" : "rgba(0,0,0,0.4)"}
                  stroke={s !== null ? (s === "make" ? "#4ade80" : "#f87171") : "rgba(255,255,255,0.25)"}
                  strokeWidth="2"
                />
                <text x={x} y={y + 5} textAnchor="middle" fill="white" fontSize="13" fontWeight="bold">
                  {s === "make" ? "✓" : s === "miss" ? "✗" : i + 1}
                </text>
              </g>
            )
          })}
        </svg>

        {/* Score overlay */}
        <div className="relative z-10 text-center">
          <div className="bg-black/60 rounded-2xl px-8 py-4 backdrop-blur-sm">
            <div className="text-7xl font-bold text-white leading-none">
              {makes}
              <span className="text-4xl text-gray-400 font-normal">/{TOTAL}</span>
            </div>
            <p className="text-sm text-gray-300 mt-1">
              {isDone ? (makes === TOTAL ? "Perfect!" : `${TOTAL - makes} missed`) : `${TOTAL - attempted} remaining`}
            </p>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="bg-gray-900 border-t border-gray-800 p-4 shrink-0">
        {!isDone ? (
          <div className="flex gap-3">
            <button
              onClick={() => record("make")}
              className="flex-1 py-5 bg-green-600 hover:bg-green-500 active:bg-green-700 text-white rounded-2xl font-bold text-xl shadow-lg"
            >
              Made ✓
            </button>
            <button
              onClick={() => record("miss")}
              className="flex-1 py-5 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white rounded-2xl font-bold text-xl shadow-lg"
            >
              Missed ✗
            </button>
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={() => onSave(makes)}
              disabled={saving}
              className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-2xl font-bold text-lg"
            >
              {saving ? "Saving…" : `Save — ${makes}/${TOTAL}`}
            </button>
          </div>
        )}
        <div className="flex gap-4 justify-center mt-3">
          {attempted > 0 && (
            <button onClick={undo} className="text-sm text-gray-400 hover:text-gray-200 underline">
              Undo last
            </button>
          )}
          {attempted > 0 && (
            <button onClick={reset} className="text-sm text-gray-400 hover:text-gray-200 underline">
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
