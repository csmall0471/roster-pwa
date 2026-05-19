"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import type { CourseSplit } from "../actions"
import { formatTime } from "../utils"
import CourtSVG from "./CourtSVG"

// ─── Course checkpoints (in order) ────────────────────────────────────────────
// Court: basket at top (195,27), FT line y=200, 3pt arc bottom y=295, half-court y=565
type Checkpoint = {
  id:       string
  label:    string
  sublabel: string
  cx:       number
  cy:       number
  r:        number
  isFinish?: boolean
}

// 5 non-overlapping checkpoints. The coach pass exchange (steps 4+5 in the
// original description) happens between CP3 and CP4 but is not a separate tap
// since it occupies the same court location as CP2.
const CHECKPOINTS: Checkpoint[] = [
  { id: "layup1",   label: "1", sublabel: "Layup →",      cx: 238, cy:  60, r: 28 },
  { id: "freethrow",label: "2", sublabel: "Free Throw",   cx: 195, cy: 200, r: 28 },
  { id: "halfcourt",label: "3", sublabel: "Half Court",   cx: 195, cy: 545, r: 30 },
  { id: "cone3pt",  label: "4", sublabel: "3pt Cone",     cx:  65, cy: 295, r: 28 },
  { id: "layup2",   label: "5", sublabel: "Layup ←",      cx: 152, cy:  60, r: 28, isFinish: true },
]

// ─── Cones ────────────────────────────────────────────────────────────────────
// Right side: 1 turn cone at bottom-right, 5 ascending zig-zag cones
// Left side: 3 cones going down from FT line to 3pt arc
const CONES: Array<{ cx: number; cy: number }> = [
  // Right side — bottom corner turn
  { cx: 350, cy: 488 },
  // Right side — 5 ascending zig-zag cones
  { cx: 375, cy: 440 },
  { cx: 320, cy: 392 },
  { cx: 372, cy: 344 },
  { cx: 322, cy: 298 },
  { cx: 368, cy: 252 },
  // Left side — 3 descending cones (last at 3pt arc level)
  { cx: 32,  cy: 220 },
  { cx: 32,  cy: 258 },
  { cx: 55,  cy: 295 },
]

// ─── Course path (dashed yellow line following the exact route) ───────────────
// 1→2: right of basket → FT line
// 2→3: FT line → right → bottom-right corner → zig-zag up → half court
// 3→4: half court → coach at FT line (pass)
// 4→5: pass back (same zone — short animation)
// 5→6: FT line area → left sideline → down 3 cones → 3pt level
// 6→7: 3pt cone → finish layup
const COURSE_PATH = [
  "M 238 60",
  "L 195 200",          // → FT line
  "L 295 200",          // right of FT line
  "L 350 488",          // → bottom-right corner cone
  "L 375 440",          // zig
  "L 320 392",          // zag
  "L 372 344",          // zig
  "L 322 298",          // zag
  "L 368 252",          // zig
  "L 195 550",          // → half court center
  "L 195 205",          // → coach (top of key, pass up)
  "L 195 340",          // bounce back (receive)
  "L 32 210",           // → left sideline
  "L 32 258",           // down through left cones
  "L 55 295",           // → last cone at 3pt
  "L 152 60",           // → finish layup
].join(" ")

// ─── Direction arrows ─────────────────────────────────────────────────────────
// Small arrowheads at key path segments
type Arrow = { x: number; y: number; angle: number }
const ARROWS: Arrow[] = [
  { x: 195, y: 150, angle: 90 },   // going down toward FT
  { x: 250, y: 200, angle:  0 },   // going right
  { x: 358, y: 370, angle: 90 },   // going up (right side)
  { x: 350, y: 310, angle: 90 },   // going up (right side)
  { x: 195, y: 480, angle: 270 },  // going up toward coach
  { x: 110, y: 210, angle: 180 },  // going left
  { x:  32, y: 238, angle: 90 },   // going down (left cones)
  { x: 110, y:  80, angle: 315 },  // going up-right to layup
]

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  initialTimeMs: number | null
  initialSplits: CourseSplit[] | null
  saving:        boolean
  onSave:        (timeMs: number, splits: CourseSplit[]) => void
}

type TimerState = "idle" | "running" | "stopped"

function Cone({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <polygon
        points={`${cx},${cy - 10} ${cx - 8},${cy + 6} ${cx + 8},${cy + 6}`}
        fill="#f97316"
        stroke="#ea580c"
        strokeWidth="1"
      />
      <line x1={cx - 9} y1={cy + 6} x2={cx + 9} y2={cy + 6} stroke="#ea580c" strokeWidth="2" />
    </g>
  )
}

function ArrowHead({ x, y, angle }: Arrow) {
  const rad = (angle * Math.PI) / 180
  const len = 12
  const tip = { x: x + Math.cos(rad) * len, y: y + Math.sin(rad) * len }
  const left = { x: x - Math.cos(rad - 0.6) * 8, y: y - Math.sin(rad - 0.6) * 8 }
  const right = { x: x - Math.cos(rad + 0.6) * 8, y: y - Math.sin(rad + 0.6) * 8 }
  return (
    <polygon
      points={`${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`}
      fill="#facc15"
      opacity="0.85"
    />
  )
}

export default function CourseScorer({ initialTimeMs, initialSplits, saving, onSave }: Props) {
  const [status, setStatus]               = useState<TimerState>("idle")
  const [elapsed, setElapsed]             = useState(0)
  const [splits, setSplits]               = useState<CourseSplit[]>(initialSplits ?? [])
  const [nextCheckpoint, setNextCheckpoint] = useState(0)
  const [finished, setFinished]           = useState(initialTimeMs != null)

  const startRef = useRef<number | null>(null)
  const rafRef   = useRef<number | null>(null)

  const tick = useCallback(() => {
    if (startRef.current == null) return
    setElapsed(performance.now() - startRef.current)
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  function start() {
    startRef.current = performance.now() - elapsed
    setStatus("running")
    rafRef.current = requestAnimationFrame(tick)
  }

  function pause() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    setStatus("stopped")
  }

  function reset() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    setElapsed(0)
    setSplits([])
    setNextCheckpoint(0)
    setFinished(false)
    startRef.current = null
    setStatus("idle")
  }

  function tapCheckpoint(cp: Checkpoint, idx: number) {
    if (status !== "running") return
    if (idx !== nextCheckpoint) return

    const timeMs = Math.round(performance.now() - (startRef.current ?? 0))
    const split: CourseSplit = { checkpoint: cp.sublabel, time_ms: timeMs, order: idx + 1 }
    const newSplits = [...splits, split]
    setSplits(newSplits)
    setNextCheckpoint(idx + 1)

    if (cp.isFinish) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      setElapsed(timeMs)
      setStatus("stopped")
      setFinished(true)
    }
  }

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  const displayMs = finished && status !== "running" ? (splits[splits.length - 1]?.time_ms ?? elapsed) : elapsed

  return (
    <div className="h-full flex flex-col bg-gray-950 select-none">

      {/* Timer + controls bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="font-mono text-3xl font-bold text-white tracking-widest">
          {formatTime(displayMs)}
        </div>
        <div className="flex gap-2 ml-auto">
          {status === "idle" && (
            <button onClick={start} className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold text-sm">
              Start
            </button>
          )}
          {status === "running" && (
            <button onClick={pause} className="px-5 py-2 bg-yellow-500 hover:bg-yellow-600 text-black rounded-lg font-semibold text-sm">
              Pause
            </button>
          )}
          {status === "stopped" && !finished && (
            <button onClick={start} className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold text-sm">
              Resume
            </button>
          )}
          <button onClick={reset} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
            Reset
          </button>
          {finished && (
            <button
              onClick={() => onSave(displayMs, splits)}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>

      {/* Court + splits */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">

        {/* Court */}
        <div className="flex-1 min-h-0 flex items-center justify-center p-2">
          <CourtSVG className="h-full w-auto">

            {/* Course path */}
            <path
              d={COURSE_PATH}
              fill="none"
              stroke="#facc15"
              strokeWidth="2.5"
              strokeDasharray="10,6"
              strokeLinecap="round"
            />

            {/* Direction arrows */}
            {ARROWS.map((a, i) => <ArrowHead key={i} {...a} />)}

            {/* Cones */}
            {CONES.map((c, i) => <Cone key={i} {...c} />)}

            {/* Checkpoint zones */}
            {CHECKPOINTS.map((cp, idx) => {
              const split = splits.find((s) => s.checkpoint === cp.sublabel)
              const tapped  = split != null
              const isNext  = idx === nextCheckpoint && status === "running"
              // Coach (4) and Receive (5) share same location — offset label
              const labelX = cp.cx
              const labelY = cp.cy

              return (
                <g
                  key={cp.id}
                  onClick={() => tapCheckpoint(cp, idx)}
                  style={{ cursor: isNext ? "pointer" : "default" }}
                >
                  {/* Pulse ring */}
                  {isNext && (
                    <circle cx={cp.cx} cy={cp.cy} r={cp.r + 12} fill="none" stroke="#facc15" strokeWidth="2.5" opacity="0.7" />
                  )}
                  <circle
                    cx={cp.cx}
                    cy={cp.cy}
                    r={cp.r}
                    fill={tapped ? "#16a34a" : isNext ? "#92400e" : "rgba(0,0,0,0.6)"}
                    stroke={tapped ? "#4ade80" : isNext ? "#facc15" : "rgba(255,255,255,0.45)"}
                    strokeWidth={isNext ? 3 : 2}
                  />
                  <text x={labelX} y={labelY - 6} textAnchor="middle" fill="white" fontSize="13" fontWeight="bold">
                    {cp.label}
                  </text>
                  <text x={labelX} y={labelY + 7} textAnchor="middle" fill={tapped ? "#bbf7d0" : "#d1d5db"} fontSize="8">
                    {tapped ? formatTime(split!.time_ms) : cp.sublabel.split(" ")[0]}
                  </text>
                </g>
              )
            })}

          </CourtSVG>
        </div>

        {/* Splits panel */}
        <div className="md:w-52 shrink-0 bg-gray-900 border-t md:border-t-0 md:border-l border-gray-800 overflow-y-auto">
          <div className="p-3 space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Split Times</p>

            {splits.length === 0 ? (
              <p className="text-xs text-gray-600 italic">
                {status === "idle"
                  ? "Start the timer, then tap each checkpoint on the court in order."
                  : `Tap checkpoint ${nextCheckpoint + 1} on the court.`}
              </p>
            ) : (
              <div className="space-y-2">
                {splits.map((s, i) => {
                  const prev  = i > 0 ? splits[i - 1].time_ms : 0
                  const split = s.time_ms - prev
                  return (
                    <div key={i} className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-white font-medium leading-tight">{s.checkpoint}</p>
                        {i > 0 && (
                          <p className="text-xs font-mono text-gray-500">+{formatTime(split)}</p>
                        )}
                      </div>
                      <span className="text-xs font-mono text-yellow-400 shrink-0">{formatTime(s.time_ms)}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {status === "running" && nextCheckpoint < CHECKPOINTS.length && (
              <div className="p-2 bg-yellow-900/40 border border-yellow-700/60 rounded-lg">
                <p className="text-xs text-yellow-300 font-semibold">
                  Next → {CHECKPOINTS[nextCheckpoint].sublabel}
                </p>
              </div>
            )}

            {finished && (
              <div className="p-2 bg-green-900/40 border border-green-700/60 rounded-lg">
                <p className="text-xs text-green-300 font-semibold">Finished!</p>
                <p className="text-sm font-mono text-green-400 font-bold">{formatTime(displayMs)}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
