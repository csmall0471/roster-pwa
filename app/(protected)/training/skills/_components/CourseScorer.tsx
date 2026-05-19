"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import type { CourseSplit } from "../actions"
import { formatTime } from "../utils"
import CourtSVG from "./CourtSVG"

// ─── Course checkpoints (in order) ────────────────────────────────────────────
// Court: basket at top (195,27), FT line y=200, 3pt arc bottom y=295, half-court y=565
type Checkpoint = {
  id:         string
  label:      string
  sublabel:   string
  cx:         number
  cy:         number
  r:          number
  isFinish?:  boolean
  promptShot?: boolean
}

// 5 non-overlapping checkpoints. The coach pass exchange (steps 4+5 in the
// original description) happens between CP3 and CP4 but is not a separate tap
// since it occupies the same court location as CP2.
const CHECKPOINTS: Checkpoint[] = [
  { id: "layup1",      label: "1", sublabel: "Layup →",    cx: 160, cy:  525, r: 28, promptShot: true },
  { id: "freethrow",  label: "2", sublabel: "Free Throw", cx: 195, cy: 375, r: 28, promptShot: true },
  { id: "dribbleRight",label:"3", sublabel: "Dribble",    cx: 320, cy: 400, r: 30 },
  { id: "pass",       label: "4", sublabel: "Pass",       cx: 195, cy: 200, r: 28 },
  { id: "dribbleLeft",label: "5", sublabel: "Dribble ",   cx: 100, cy: 320, r: 30 },
  { id: "layup2",     label: "6", sublabel: "Layup ←",    cx: 130, cy:  475, r: 28, isFinish: true, promptShot: true },
]

// ─── Cones ────────────────────────────────────────────────────────────────────
// Right side: 1 turn cone at bottom-right, 5 ascending zig-zag cones
// Left side: 3 cones going down from FT line to 3pt arc
const CONES: Array<{ cx: number; cy: number }> = [
  // Right side — bottom corner turn
  { cx: 340, cy: 525 },
  { cx: 340, cy: 450 },
  { cx: 340, cy: 375 },
  { cx: 340, cy: 300 },
  { cx: 340, cy: 220 },
  // Left side — 3 descending cones (last at 3pt arc level)
  { cx: 55,  cy: 220 },
  { cx: 55,  cy: 290 },
  { cx: 55,  cy: 360 },
]

// ─── Course path (curved, weaving through cones) ─────────────────────────────
// CP1→CP2: start layup position → FT area (up)
// CP2→rebound: run toward basket to get rebound, then sweep down-right to bottom cone
// → zigzag UP through 5 right cones → CP4 (pass zone)
// CP4→left cones: go left, zigzag DOWN through 3 left cones (CP5 is a tap, not exact position)
// →CP6: exit left cones → finish layup
// Note: CP3 and CP5 are app tap points only — path does not route through their exact coords
const COURSE_PATH = [
  "M 160 525",                               // CP1 start
  "C 175 480, 192 420, 195 375",             // → CP2 (FT area, curve up from basket)
  // After FT: go DOWN toward basket for rebound, then swing right to corner cone
  "C 200 440, 220 495, 235 515",             // down toward basket for rebound
  "C 280 525, 330 525, 360 530",             // swing right along baseline to corner cone
  "C 370 540, 383 535, 383 520",             // around bottom cone (340,525) right side
  "C 383 490, 280 465, 280 450",             // zigzag LEFT past cone (340,450)
  "C 280 428, 383 400, 383 375",             // zigzag RIGHT past cone (340,375)
  "C 383 348, 280 323, 280 300",             // zigzag LEFT past cone (340,300)
  "C 280 267, 383 242, 383 220",             // zigzag RIGHT past cone (340,220)
  "C 383 205, 285 198, 195 200",             // exit right cones → CP4 (pass)
  "C 165 200, 100 210, 75 220",              // CP4 → enter left cones
  "C 75 232, 30 260, 30 290",                // around cone (55,220) right → cone (55,290) left
  "C 30 308, 100 320, 105 328",              // around cone (55,290) left → RIGHT through CP5 area
  "C 105 342, 35 357, 35 362",               // back left past cone (55,360)
  "C 45 412, 108 460, 130 475",              // exit left cones → CP6 (finish)
].join(" ")

// ─── Direction arrows ─────────────────────────────────────────────────────────
// Small arrowheads at key path segments
type Arrow = { x: number; y: number; angle: number }
const ARROWS: Arrow[] = [
  { x: 172, y: 460, angle: 285 },  // CP1→CP2: going up (away from basket)
  { x: 205, y: 453, angle:  92 },  // CP2→rebound: going DOWN toward basket
  { x: 300, y: 524, angle:   4 },  // rebound→corner: going right along baseline
  { x: 330, y: 420, angle: 270 },  // zigzag up right side (lower)
  { x: 330, y: 265, angle: 270 },  // zigzag up right side (upper)
  { x: 285, y: 200, angle: 180 },  // exit right cones → CP4: going left
  { x: 135, y: 205, angle: 185 },  // CP4 → left cones: going left
  { x:  55, y: 308, angle:  90 },  // through left cones: going down
  { x:  85, y: 445, angle:  50 },  // exit left cones → CP6: going down-right
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
  const [pendingTap, setPendingTap]       = useState<{ cp: Checkpoint; idx: number; timeMs: number } | null>(null)

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
    if (cp.promptShot) {
      setPendingTap({ cp, idx, timeMs })
      return
    }
    recordSplit(cp, idx, timeMs, null)
  }

  function confirmShot(made: boolean) {
    if (!pendingTap) return
    const { cp, idx, timeMs } = pendingTap
    setPendingTap(null)
    recordSplit(cp, idx, timeMs, made)
  }

  function recordSplit(cp: Checkpoint, idx: number, timeMs: number, made: boolean | null) {
    const label = made == null ? cp.sublabel : `${cp.sublabel}: ${made ? "Made" : "Missed"}`
    const split: CourseSplit = { checkpoint: label, time_ms: timeMs, order: idx + 1 }
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
    <div className="relative h-full flex flex-col bg-gray-950 select-none">

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
          <CourtSVG className="h-full w-auto" flip>

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

            {/* Coach pass exchange — two offset lines + coach marker */}
            {/* Pass from player (CP4 at 195,200) to coach (top of key, ~385) */}
            <line x1="187" y1="205" x2="187" y2="300"
               stroke="#60a5fa" strokeWidth="2.5" strokeDasharray="10,5" strokeLinecap="round" />
            {/* Pass back from coach to player */}
            <line x1="203" y1="300" x2="203" y2="205"
               stroke="#fb923c" strokeWidth="2.5" strokeDasharray="4,4" strokeLinecap="round" />
            {/* Coach marker */}
            <circle cx="195" cy="315" r="18" fill="rgba(96,165,250,0.18)" stroke="#60a5fa" strokeWidth="2" strokeDasharray="5,3" />
            <text x="195" y="315" textAnchor="middle" fill="#93c5fd" fontSize="7.5" fontWeight="bold">Coach</text>

            {/* Cones */}
            {CONES.map((c, i) => <Cone key={i} {...c} />)}

            {/* Checkpoint zones */}
            {CHECKPOINTS.map((cp, idx) => {
              const split = splits.find((s) => s.order === idx + 1)
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
                    {tapped
                      ? (split!.checkpoint.includes("Made") ? "✓ Made" : split!.checkpoint.includes("Missed") ? "✗ Miss" : formatTime(split!.time_ms))
                      : cp.sublabel.split(" ")[0]}
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

      {/* Make/Miss popover for shooting checkpoints */}
      {pendingTap && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-3xl p-6 mx-6 w-full max-w-sm shadow-2xl">
            <p className="text-center text-white text-xl font-bold mb-1">
              {pendingTap.cp.sublabel}
            </p>
            <p className="text-center text-gray-400 text-sm mb-6">
              {formatTime(pendingTap.timeMs)}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => confirmShot(true)}
                className="flex-1 py-5 bg-green-600 hover:bg-green-500 active:bg-green-700 text-white rounded-2xl font-bold text-2xl shadow-lg"
              >
                Made ✓
              </button>
              <button
                onClick={() => confirmShot(false)}
                className="flex-1 py-5 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white rounded-2xl font-bold text-2xl shadow-lg"
              >
                Missed ✗
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
