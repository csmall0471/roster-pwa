"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import type { CourseSplit } from "../actions"
import { formatTime } from "../utils"

// Checkpoints in order — positions on the SVG viewBox 390 x 580
type Checkpoint = {
  id:    string
  label: string
  cx:    number
  cy:    number
  isFinish?: boolean
}

const CHECKPOINTS: Checkpoint[] = [
  { id: "start",      label: "Start",          cx: 195, cy: 530 },
  { id: "left1",      label: "Left Cones",      cx:  65, cy: 420 },
  { id: "left2",      label: "Top Left",        cx:  65, cy: 200 },
  { id: "across",     label: "Across Top",      cx: 195, cy: 155 },
  { id: "coach",      label: "Pass to Coach",   cx: 305, cy: 200 },
  { id: "right1",     label: "Right Cones",     cx: 325, cy: 370 },
  { id: "layup",      label: "Layup / Finish",  cx: 195, cy: 440, isFinish: true },
]

// SVG path elements for the course route
const COURSE_PATH = "M 195 530 L 65 480 L 65 360 L 65 240 L 65 200 L 195 155 L 305 200 L 325 300 L 325 370 L 230 440 L 195 440"

// Cone positions along the left side (going up) and right side (going down)
const CONES = [
  { cx:  90, cy: 475 }, { cx:  45, cy: 445 },
  { cx:  90, cy: 395 }, { cx:  45, cy: 360 },
  { cx:  90, cy: 310 }, { cx:  45, cy: 275 },
  { cx:  90, cy: 235 },
  // right side
  { cx: 305, cy: 305 }, { cx: 348, cy: 340 },
  { cx: 305, cy: 385 }, { cx: 348, cy: 415 },
]

type Props = {
  initialTimeMs: number | null
  initialSplits: CourseSplit[] | null
  saving:        boolean
  onSave:        (timeMs: number, splits: CourseSplit[]) => void
}

type TimerState = "idle" | "running" | "stopped"

export default function CourseScorer({ initialTimeMs, initialSplits, saving, onSave }: Props) {
  const [status, setStatus]         = useState<TimerState>("idle")
  const [elapsed, setElapsed]       = useState(0)
  const [splits, setSplits]         = useState<CourseSplit[]>(initialSplits ?? [])
  const [nextCheckpoint, setNextCheckpoint] = useState(0)
  const [finished, setFinished]     = useState(initialTimeMs != null)

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

  function stop() {
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
    if (idx !== nextCheckpoint) return // must tap in order

    const timeMs = Math.round(performance.now() - (startRef.current ?? 0))
    const split: CourseSplit = { checkpoint: cp.label, time_ms: timeMs, order: idx + 1 }
    const newSplits = [...splits, split]
    setSplits(newSplits)
    setNextCheckpoint(idx + 1)

    if (cp.isFinish) {
      stop()
      setElapsed(timeMs)
      setFinished(true)
    }
  }

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  const canSave = finished && splits.length > 0

  return (
    <div className="h-full flex flex-col bg-gray-950 select-none">
      {/* Timer bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 shrink-0">
        <div className="font-mono text-3xl font-bold text-white tracking-wider">
          {formatTime(elapsed)}
        </div>
        <div className="flex gap-2">
          {status === "idle" && (
            <button
              onClick={start}
              className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold text-sm"
            >
              Start
            </button>
          )}
          {status === "running" && (
            <button
              onClick={stop}
              className="px-5 py-2 bg-yellow-500 hover:bg-yellow-600 text-black rounded-lg font-semibold text-sm"
            >
              Pause
            </button>
          )}
          {status === "stopped" && !finished && (
            <button
              onClick={start}
              className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold text-sm"
            >
              Resume
            </button>
          )}
          <button
            onClick={reset}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
          >
            Reset
          </button>
          {canSave && (
            <button
              onClick={() => onSave(elapsed, splits)}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>

      {/* Main area: court + splits panel */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
        {/* SVG court */}
        <div className="flex-1 min-h-0 flex items-center justify-center p-2">
          <svg
            viewBox="0 0 390 580"
            className="h-full max-h-full w-auto"
            style={{ maxHeight: "100%", maxWidth: "100%" }}
          >
            {/* Court background */}
            <rect x="0" y="0" width="390" height="580" fill="#c8a96e" />
            <rect x="6" y="6" width="378" height="568" fill="none" stroke="#fff" strokeWidth="3" />

            {/* Half-court line */}
            <line x1="6" y1="490" x2="384" y2="490" stroke="white" strokeWidth="2" />

            {/* Key / paint (basket at top) */}
            <rect x="135" y="6" width="120" height="175" fill="rgba(180,120,40,0.4)" stroke="white" strokeWidth="2" />

            {/* Free throw line */}
            <line x1="135" y1="181" x2="255" y2="181" stroke="white" strokeWidth="2" />

            {/* Free throw circle */}
            <circle cx="195" cy="181" r="55" fill="none" stroke="white" strokeWidth="2" />

            {/* Backboard */}
            <rect x="160" y="6" width="70" height="10" fill="none" stroke="white" strokeWidth="3" />

            {/* Rim */}
            <circle cx="195" cy="28" r="15" fill="none" stroke="#e55" strokeWidth="3" />

            {/* Three-point arc */}
            <path d="M 25 490 A 173 173 0 0 1 365 490" fill="none" stroke="white" strokeWidth="2" />

            {/* Restricted area arc */}
            <path d="M 170 28 A 30 30 0 0 1 220 28" fill="none" stroke="white" strokeWidth="1.5" strokeDasharray="4,3" />

            {/* Course path (dashed arrows) */}
            <path
              d={COURSE_PATH}
              fill="none"
              stroke="#facc15"
              strokeWidth="2.5"
              strokeDasharray="10,6"
              strokeLinecap="round"
            />

            {/* Direction arrowheads along path */}
            {/* Left side going up */}
            <polygon points="65,380 58,394 72,394" fill="#facc15" />
            <polygon points="65,260 58,274 72,274" fill="#facc15" />
            {/* Across top */}
            <polygon points="155,155 143,148 143,162" fill="#facc15" />
            {/* Right side going down */}
            <polygon points="325,310 318,296 332,296" fill="#facc15" transform="rotate(180,325,310)" />

            {/* Cones */}
            {CONES.map((c, i) => (
              <g key={i}>
                <polygon
                  points={`${c.cx},${c.cy - 9} ${c.cx - 7},${c.cy + 5} ${c.cx + 7},${c.cy + 5}`}
                  fill="#f97316"
                  stroke="#ea580c"
                  strokeWidth="1"
                />
                <line x1={c.cx - 8} y1={c.cy + 5} x2={c.cx + 8} y2={c.cy + 5} stroke="#ea580c" strokeWidth="2" />
              </g>
            ))}

            {/* Checkpoint zones */}
            {CHECKPOINTS.map((cp, idx) => {
              const tapped = splits.findIndex((s) => s.checkpoint === cp.label) !== -1
              const isNext = idx === nextCheckpoint && status === "running"
              const r = cp.isFinish ? 34 : 28

              return (
                <g
                  key={cp.id}
                  onClick={() => tapCheckpoint(cp, idx)}
                  style={{ cursor: status === "running" && idx === nextCheckpoint ? "pointer" : "default" }}
                >
                  {/* Pulse ring for next checkpoint */}
                  {isNext && (
                    <circle cx={cp.cx} cy={cp.cy} r={r + 10} fill="none" stroke="#facc15" strokeWidth="2" opacity="0.6" />
                  )}
                  <circle
                    cx={cp.cx}
                    cy={cp.cy}
                    r={r}
                    fill={tapped ? "#16a34a" : isNext ? "#854d0e" : "rgba(0,0,0,0.55)"}
                    stroke={tapped ? "#4ade80" : isNext ? "#facc15" : "rgba(255,255,255,0.4)"}
                    strokeWidth={isNext ? 3 : 2}
                  />
                  <text
                    x={cp.cx}
                    y={cp.cy - 5}
                    textAnchor="middle"
                    fill="white"
                    fontSize="11"
                    fontWeight="bold"
                  >
                    {idx + 1}
                  </text>
                  <text
                    x={cp.cx}
                    y={cp.cy + 8}
                    textAnchor="middle"
                    fill={tapped ? "#bbf7d0" : "#d1d5db"}
                    fontSize="8"
                  >
                    {tapped ? formatTime(splits.find((s) => s.checkpoint === cp.label)!.time_ms) : cp.label.split(" ")[0]}
                  </text>
                </g>
              )
            })}

            {/* Coach marker */}
            <text x="195" y="175" textAnchor="middle" fill="#fde68a" fontSize="10" fontWeight="bold">COACH</text>
          </svg>
        </div>

        {/* Splits panel */}
        <div className="md:w-52 shrink-0 bg-gray-900 border-t md:border-t-0 md:border-l border-gray-800 overflow-y-auto">
          <div className="p-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Split Times</p>
            {splits.length === 0 ? (
              <p className="text-xs text-gray-600 italic">
                {status === "idle"
                  ? "Start the timer, then tap checkpoints in order."
                  : "Tap checkpoint 1 on the court."}
              </p>
            ) : (
              <div className="space-y-1.5">
                {splits.map((s, i) => {
                  const prev = i > 0 ? splits[i - 1].time_ms : 0
                  const split = s.time_ms - prev
                  return (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">{s.checkpoint}</span>
                      <div className="text-right">
                        <span className="text-xs font-mono text-white">{formatTime(s.time_ms)}</span>
                        {i > 0 && (
                          <span className="block text-xs font-mono text-gray-500">+{formatTime(split)}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Instruction overlay */}
            {status === "running" && nextCheckpoint < CHECKPOINTS.length && (
              <div className="mt-4 p-2 bg-yellow-900/40 border border-yellow-700 rounded-lg">
                <p className="text-xs text-yellow-300 font-medium">
                  Next: {CHECKPOINTS[nextCheckpoint].label}
                </p>
                <p className="text-xs text-yellow-500 mt-0.5">Tap the glowing zone</p>
              </div>
            )}

            {finished && (
              <div className="mt-4 p-2 bg-green-900/40 border border-green-700 rounded-lg">
                <p className="text-xs text-green-300 font-semibold">Finished!</p>
                <p className="text-xs font-mono text-green-400">{formatTime(elapsed)}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
