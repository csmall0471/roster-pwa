"use client"

import { useState, useEffect } from "react"

export type HotShotsData = {
  hot_shots_8pt: number
  hot_shots_7pt: number
  hot_shots_5pt: number
  hot_shots_3pt: number
  hot_shots_2pt: number
}

type Props = {
  initial: HotShotsData
  onSave:  (data: HotShotsData) => void
  saving:  boolean
}

type Position = {
  key:   keyof HotShotsData
  pts:   number
  max:   number
  color: string
  // SVG coords (viewBox 400 x 340)
  cx:    number
  cy:    number
  label: string
}

const POSITIONS: Position[] = [
  { key: "hot_shots_8pt", pts: 8, max: 10, color: "#7c3aed", cx: 70,  cy: 80,  label: "8 pts" },
  { key: "hot_shots_7pt", pts: 7, max: 10, color: "#2563eb", cx: 330, cy: 80,  label: "7 pts" },
  { key: "hot_shots_5pt", pts: 5, max: 10, color: "#0891b2", cx: 200, cy: 140, label: "5 pts" },
  { key: "hot_shots_3pt", pts: 3, max: 10, color: "#059669", cx: 310, cy: 220, label: "3 pts" },
  { key: "hot_shots_2pt", pts: 2, max: 8,  color: "#d97706", cx: 90,  cy: 220, label: "2 pts\n(max 8)" },
]

const EMPTY: HotShotsData = {
  hot_shots_8pt: 0,
  hot_shots_7pt: 0,
  hot_shots_5pt: 0,
  hot_shots_3pt: 0,
  hot_shots_2pt: 0,
}

export default function HotShotsBoard({ initial, onSave, saving }: Props) {
  const [data, setData] = useState<HotShotsData>(initial)

  useEffect(() => { setData(initial) }, [initial])

  function add(key: keyof HotShotsData, max: number) {
    setData((prev) => ({ ...prev, [key]: Math.min(prev[key] + 1, max) }))
  }

  function sub(key: keyof HotShotsData) {
    setData((prev) => ({ ...prev, [key]: Math.max(prev[key] - 1, 0) }))
  }

  const total = POSITIONS.reduce((sum, p) => sum + data[p.key] * p.pts, 0)
  const hasData = Object.values(data).some((v) => v > 0)

  return (
    <div className="space-y-4">
      {/* SVG Court */}
      <div className="w-full max-w-sm mx-auto">
        <svg viewBox="0 0 400 310" className="w-full" role="img" aria-label="Hot Shots court diagram">
          {/* Court outline */}
          <rect x="10" y="10" width="380" height="295" rx="4" fill="#e8f4e8" stroke="#4b7a4b" strokeWidth="3"/>

          {/* Three-point arc (basket at bottom center ~cy=290) */}
          <path
            d="M 30 290 A 175 175 0 0 1 370 290"
            fill="none" stroke="#4b7a4b" strokeWidth="2" strokeDasharray="6,4"
          />

          {/* Paint / key */}
          <rect x="150" y="185" width="100" height="110" fill="#d4edda" stroke="#4b7a4b" strokeWidth="2"/>

          {/* Free throw line */}
          <line x1="150" y1="185" x2="250" y2="185" stroke="#4b7a4b" strokeWidth="2"/>

          {/* Free throw circle */}
          <circle cx="200" cy="185" r="45" fill="none" stroke="#4b7a4b" strokeWidth="2"/>

          {/* Backboard */}
          <rect x="163" y="276" width="74" height="8" rx="2" fill="#888" stroke="#555" strokeWidth="1"/>

          {/* Basket */}
          <circle cx="200" cy="284" r="12" fill="none" stroke="#e55" strokeWidth="2.5"/>

          {/* Shot position markers */}
          {POSITIONS.map((pos) => {
            const makes = data[pos.key]
            return (
              <g key={pos.key}>
                {/* Glow ring when any makes */}
                {makes > 0 && (
                  <circle cx={pos.cx} cy={pos.cy} r="28" fill={pos.color} opacity="0.2"/>
                )}
                <circle cx={pos.cx} cy={pos.cy} r="24" fill={pos.color} opacity="0.9"/>
                <text x={pos.cx} y={pos.cy - 5} textAnchor="middle" fill="white" fontSize="13" fontWeight="bold">
                  {pos.pts}pt
                </text>
                <text x={pos.cx} y={pos.cy + 10} textAnchor="middle" fill="white" fontSize="15" fontWeight="bold">
                  {makes}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* Controls per position */}
      <div className="grid grid-cols-1 gap-2">
        {POSITIONS.map((pos) => {
          const makes = data[pos.key]
          return (
            <div
              key={pos.key}
              className="flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ backgroundColor: pos.color }}
                >
                  {pos.pts}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{pos.label.replace("\n", " ")}</p>
                  <p className="text-xs text-gray-400">{makes * pos.pts} pts earned</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => sub(pos.key)}
                  disabled={makes === 0}
                  className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 disabled:opacity-30 hover:bg-gray-200 dark:hover:bg-gray-600 font-bold text-lg text-gray-700 dark:text-gray-200 flex items-center justify-center"
                >
                  −
                </button>
                <span className="w-8 text-center font-bold text-gray-900 dark:text-white">{makes}</span>
                <button
                  onClick={() => add(pos.key, pos.max)}
                  disabled={makes >= pos.max}
                  className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 disabled:opacity-30 hover:bg-gray-200 dark:hover:bg-gray-600 font-bold text-lg text-gray-700 dark:text-gray-200 flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Total + save */}
      <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-900 rounded-xl px-4 py-3 border border-gray-200 dark:border-gray-700">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Hot Shots score</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{total} pts</p>
        </div>
        <button
          onClick={() => onSave(data)}
          disabled={saving || !hasData}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium text-sm"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="text-center">
        <button
          onClick={() => setData(EMPTY)}
          className="text-xs text-gray-400 hover:underline"
        >
          Reset all
        </button>
      </div>
    </div>
  )
}
