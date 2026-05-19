"use client"

import { useState, useEffect } from "react"
import CourtSVG from "./CourtSVG"

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

  const attempted = shots.filter((s) => s !== null).length
  const makes     = shots.filter((s) => s === "make").length
  const isDone    = attempted === TOTAL

  function record(result: "make" | "miss") {
    if (isDone) return
    setShots((prev) => {
      const next = [...prev]
      const idx  = next.findIndex((s) => s === null)
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
    <div className="h-full flex flex-col bg-gray-950 select-none">

      {/* Court — shared with course, no extra lines */}
      <div className="flex-1 min-h-0 relative flex items-center justify-center p-2">
        <CourtSVG className="h-full w-auto absolute inset-0 m-auto" style={{ position: "absolute" }}>

          {/* Player position dot at FT line */}
          <ellipse cx="195" cy="210" rx="14" ry="7" fill="rgba(255,255,255,0.25)" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
          <text x="195" y="213" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="8">you</text>

          {/* Shot attempt dots on court — 10 dots arranged along the FT circle */}
          {shots.map((s, i) => {
            // Arc below FT line (into open court): angle 0=right, π=left, peaks at π/2=bottom
            const angle = (i / (TOTAL - 1)) * Math.PI
            const r = 55
            const cx = 195 + r * Math.cos(angle)
            const cy = 200 + r * Math.sin(angle)
            return (
              <g key={i}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={11}
                  fill={s === "make" ? "#16a34a" : s === "miss" ? "#dc2626" : "rgba(0,0,0,0.5)"}
                  stroke={s === "make" ? "#4ade80" : s === "miss" ? "#f87171" : "rgba(255,255,255,0.3)"}
                  strokeWidth="2"
                />
                <text x={cx} y={cy + 5} textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">
                  {s === "make" ? "✓" : s === "miss" ? "✗" : i + 1}
                </text>
              </g>
            )
          })}
        </CourtSVG>

        {/* Score overlay — centered on top of court */}
        <div className="relative z-10 pointer-events-none">
          <div className="bg-black/65 rounded-2xl px-10 py-5 text-center backdrop-blur-sm">
            <div className="text-7xl font-bold text-white leading-none">
              {makes}
              <span className="text-4xl text-gray-400 font-normal">/{TOTAL}</span>
            </div>
            <p className="text-sm text-gray-300 mt-1.5">
              {isDone
                ? makes === TOTAL ? "Perfect!" : `${TOTAL - makes} missed`
                : `${TOTAL - attempted} remaining`}
            </p>
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="bg-gray-900 border-t border-gray-800 p-4 shrink-0">
        {!isDone ? (
          <div className="flex gap-3">
            <button
              onClick={() => record("make")}
              className="flex-1 py-5 bg-green-600 hover:bg-green-500 active:bg-green-700 text-white rounded-2xl font-bold text-2xl shadow-lg"
            >
              Made ✓
            </button>
            <button
              onClick={() => record("miss")}
              className="flex-1 py-5 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white rounded-2xl font-bold text-2xl shadow-lg"
            >
              Missed ✗
            </button>
          </div>
        ) : (
          <button
            onClick={() => onSave(makes)}
            disabled={saving}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-2xl font-bold text-lg"
          >
            {saving ? "Saving…" : `Save — ${makes}/${TOTAL}`}
          </button>
        )}
        <div className="flex gap-5 justify-center mt-3">
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
