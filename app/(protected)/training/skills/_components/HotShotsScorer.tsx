"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import type { ShotLogEntry } from "../actions"
import { formatTime, hotShotsTotal } from "../utils"
import CourtSVG from "./CourtSVG"

// ─── Shot positions ────────────────────────────────────────────────────────────
// Court is rendered with flip=true so the basket appears at the BOTTOM, matching
// the score sheet orientation. Zone coordinates are in normal SVG viewport space
// (basket visually at bottom ≈ y=553, half-court at top ≈ y=15).
//
//   8pt → top-left far corner (beyond 3pt, left)
//   7pt → top-right far corner (beyond 3pt, right)
//   5pt → center, at free throw line level
//   3pt → right wing, closer to basket
//   2pt → left wing, closer to basket (max 8)

type Position = {
  id:    ShotLogEntry["position"]
  pts:   number
  max:   number
  cx:    number
  cy:    number
  r:     number
  color: string
}

// In flipped viewport: basket at y≈553 (bottom), FT line at y≈380, 3pt arc peak at y≈285.
// 8pt/7pt are just outside the 3pt arc at the left/right corners.
// 5pt is at the free throw line center.
// 3pt/2pt are in the wing/elbow area between the FT line and basket.
const POSITIONS: Position[] = [
  { id: "8pt", pts: 8, max: 10, cx:  55, cy: 265, r: 36, color: "#7c3aed" },
  { id: "7pt", pts: 7, max: 10, cx: 335, cy: 265, r: 36, color: "#2563eb" },
  { id: "5pt", pts: 5, max: 10, cx: 195, cy: 380, r: 34, color: "#0891b2" },
  { id: "3pt", pts: 3, max: 10, cx: 300, cy: 460, r: 30, color: "#059669" },
  { id: "2pt", pts: 2, max:  8, cx:  90, cy: 460, r: 30, color: "#d97706" },
]

const POS_COLORS: Record<ShotLogEntry["position"], string> = {
  "8pt": "#7c3aed",
  "7pt": "#2563eb",
  "5pt": "#0891b2",
  "3pt": "#059669",
  "2pt": "#d97706",
}

const DEFAULT_TIMER_MS = 60_000

type TimerState = "idle" | "running" | "paused" | "ended"

type Popover = {
  posId: ShotLogEntry["position"]
  screenX: number
  screenY: number
}

type Props = {
  initialLog: ShotLogEntry[] | null
  saving:     boolean
  onSave:     (
    log: ShotLogEntry[],
    makes: { hot_shots_8pt: number; hot_shots_7pt: number; hot_shots_5pt: number; hot_shots_3pt: number; hot_shots_2pt: number }
  ) => void
}

export default function HotShotsScorer({ initialLog, saving, onSave }: Props) {
  const [log, setLog]                 = useState<ShotLogEntry[]>(initialLog ?? [])
  const [timerStatus, setTimerStatus] = useState<TimerState>("idle")
  const [timerMs, setTimerMs]         = useState(DEFAULT_TIMER_MS)
  const [remaining, setRemaining]     = useState(DEFAULT_TIMER_MS)
  const [editingTimer, setEditingTimer] = useState(false)
  const [editMin, setEditMin]         = useState("1")
  const [editSec, setEditSec]         = useState("00")
  const [popover, setPopover]         = useState<Popover | null>(null)

  const startRef    = useRef<number | null>(null)
  const timerMsRef  = useRef(DEFAULT_TIMER_MS)
  const rafRef      = useRef<number | null>(null)

  useEffect(() => { timerMsRef.current = timerMs }, [timerMs])

  const tick = useCallback(() => {
    if (startRef.current == null) return
    const elapsed = performance.now() - startRef.current
    const rem = Math.max(0, timerMsRef.current - elapsed)
    setRemaining(rem)
    if (rem <= 0) {
      setTimerStatus("ended")
      setPopover(null)
      return
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  function startTimer() {
    startRef.current = performance.now() - (timerMsRef.current - remaining)
    setTimerStatus("running")
    rafRef.current = requestAnimationFrame(tick)
  }

  function pauseTimer() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    setTimerStatus("paused")
  }

  function resetTimer() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    startRef.current = null
    setRemaining(timerMs)
    setLog([])
    setTimerStatus("idle")
    setPopover(null)
  }

  function applyTimerEdit() {
    const mins = Math.max(0, parseInt(editMin) || 0)
    const secs = Math.max(0, parseInt(editSec) || 0)
    const ms = (mins * 60 + secs) * 1000
    if (ms > 0) {
      setTimerMs(ms)
      timerMsRef.current = ms
      setRemaining(ms)
    }
    setEditingTimer(false)
  }

  // Tap a shot zone on the court — show make/miss popover
  function handleZoneTap(pos: Position, e: React.MouseEvent<SVGGElement>) {
    if (timerStatus !== "running") return
    setPopover({ posId: pos.id, screenX: e.clientX, screenY: e.clientY })
  }

  // Record a shot from the popover
  function recordShot(posId: ShotLogEntry["position"], made: boolean) {
    const pos = POSITIONS.find((p) => p.id === posId)!
    if (made) {
      const makes = log.filter((s) => s.position === posId && s.made).length
      if (makes >= pos.max) { setPopover(null); return }
    }
    const elapsed = startRef.current != null ? Math.round(performance.now() - startRef.current) : 0
    const shotTime = Math.max(0, timerMsRef.current - elapsed)
    setLog((prev) => [
      ...prev,
      { position: posId, made, time_ms: timerMsRef.current - shotTime, order: prev.length + 1 },
    ])
    setPopover(null)
  }

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  // Close popover on outside click
  useEffect(() => {
    if (!popover) return
    function close(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest("[data-popover]")) setPopover(null)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [popover])

  function posStats(posId: ShotLogEntry["position"]) {
    const posShots = log.filter((s) => s.position === posId)
    return { makes: posShots.filter((s) => s.made).length, total: posShots.length }
  }

  function computeMakes() {
    return {
      hot_shots_8pt: posStats("8pt").makes,
      hot_shots_7pt: posStats("7pt").makes,
      hot_shots_5pt: posStats("5pt").makes,
      hot_shots_3pt: posStats("3pt").makes,
      hot_shots_2pt: Math.min(posStats("2pt").makes, 8),
    }
  }

  const totalPts = hotShotsTotal(computeMakes())
  const isEnded  = timerStatus === "ended"
  const pct      = remaining / timerMs
  const timerColor = pct > 0.4 ? "#4ade80" : pct > 0.2 ? "#facc15" : "#f87171"

  return (
    <div className="h-full flex flex-col bg-gray-950 select-none">

      {/* Controls bar */}
      <div className="flex items-center gap-3 px-3 py-2 bg-gray-900 border-b border-gray-800 shrink-0 flex-wrap">

        {/* Countdown timer */}
        {editingTimer ? (
          <div className="flex items-center gap-1.5">
            <input
              value={editMin}
              onChange={(e) => setEditMin(e.target.value)}
              className="w-10 text-center bg-gray-800 text-white text-sm rounded px-1 py-1 border border-gray-600"
              maxLength={2}
            />
            <span className="text-gray-300 font-bold">:</span>
            <input
              value={editSec}
              onChange={(e) => setEditSec(e.target.value)}
              className="w-10 text-center bg-gray-800 text-white text-sm rounded px-1 py-1 border border-gray-600"
              maxLength={2}
            />
            <button onClick={applyTimerEdit} className="text-xs bg-blue-700 hover:bg-blue-600 text-white px-2 py-1.5 rounded">Set</button>
            <button onClick={() => setEditingTimer(false)} className="text-xs text-gray-400 hover:text-white px-1">✕</button>
          </div>
        ) : (
          <button
            onClick={() => { if (timerStatus === "idle") setEditingTimer(true) }}
            title={timerStatus === "idle" ? "Tap to set time" : undefined}
            className="font-mono text-2xl font-bold tracking-wide"
            style={{ color: timerColor }}
          >
            {formatTime(remaining)}
          </button>
        )}

        {/* Timer controls */}
        <div className="flex gap-1.5">
          {timerStatus === "idle" && (
            <button onClick={startTimer} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded font-semibold text-xs">Start</button>
          )}
          {timerStatus === "running" && (
            <button onClick={pauseTimer} className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-black rounded font-semibold text-xs">Pause</button>
          )}
          {timerStatus === "paused" && (
            <button onClick={startTimer} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded font-semibold text-xs">Resume</button>
          )}
          <button onClick={resetTimer} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs">Reset</button>
          {log.length > 0 && (
            <button onClick={() => setLog((p) => p.slice(0, -1))} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs">Undo</button>
          )}
        </div>

        <span className="text-xs text-gray-500 ml-auto">
          {timerStatus === "idle" ? "Start timer, then tap a spot" : timerStatus === "running" ? "Tap a spot to record a shot" : ""}
        </span>
      </div>

      {/* Court + log */}
      <div className="flex-1 min-h-0 flex flex-row overflow-hidden">

        {/* Court */}
        <div className="flex-1 min-h-0 flex items-center justify-center p-2">
          <CourtSVG className="h-full w-auto" flip>

            {/* Shot zones */}
            {POSITIONS.map((pos) => {
              const stats = posStats(pos.id)
              const active = timerStatus === "running"
              const lastShot = [...log].reverse().find((s) => s.position === pos.id)

              return (
                <g
                  key={pos.id}
                  onClick={(e) => handleZoneTap(pos, e)}
                  style={{ cursor: active ? "pointer" : "default" }}
                >
                  {/* Tap area glow */}
                  {active && (
                    <circle cx={pos.cx} cy={pos.cy} r={pos.r + 14} fill={pos.color} opacity="0.12" />
                  )}

                  <circle
                    cx={pos.cx}
                    cy={pos.cy}
                    r={pos.r}
                    fill={pos.color}
                    opacity={active ? 0.92 : 0.5}
                    stroke="white"
                    strokeWidth={active ? 2.5 : 1.5}
                  />

                  {/* Points label */}
                  <text x={pos.cx} y={pos.cy - 8} textAnchor="middle" fill="white" fontSize="17" fontWeight="bold">
                    {pos.pts}pt
                  </text>

                  {/* Makes/total */}
                  <text x={pos.cx} y={pos.cy + 8} textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">
                    {stats.makes}/{stats.total}
                  </text>

                  {/* Last shot result flash */}
                  {lastShot && (
                    <text
                      x={pos.cx + pos.r - 4}
                      y={pos.cy - pos.r + 14}
                      fill={lastShot.made ? "#4ade80" : "#f87171"}
                      fontSize="18"
                      fontWeight="bold"
                    >
                      {lastShot.made ? "✓" : "✗"}
                    </text>
                  )}
                </g>
              )
            })}

            {/* Ended overlay */}
            {isEnded && (
              <>
                <rect x="80" y="220" width="230" height="65" rx="12" fill="rgba(0,0,0,0.8)" />
                <text x="195" y="250" textAnchor="middle" fill="#facc15" fontSize="18" fontWeight="bold">Time&apos;s up!</text>
                <text x="195" y="272" textAnchor="middle" fill="white" fontSize="13">{totalPts} pts total</text>
              </>
            )}

          </CourtSVG>
        </div>

        {/* Shot log + summary */}
        <div className="w-44 shrink-0 bg-gray-900 border-l border-gray-800 overflow-y-auto flex flex-col h-full">

          {/* Score summary */}
          <div className="p-3 border-b border-gray-800 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Score</p>
              <span className="text-xl font-bold text-white">{totalPts} pts</span>
            </div>
            <div className="grid grid-cols-5 gap-px">
              {POSITIONS.map((pos) => {
                const s = posStats(pos.id)
                return (
                  <div key={pos.id} className="text-center">
                    <div className="text-xs font-bold" style={{ color: pos.color }}>{pos.pts}pt</div>
                    <div className="text-xs text-white font-mono">{s.makes}/{s.total}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Shot log */}
          <div className="flex-1 overflow-y-auto p-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Shot Log</p>
            {log.length === 0 ? (
              <p className="text-xs text-gray-600 italic">No shots yet.</p>
            ) : (
              <div className="space-y-1">
                {[...log].reverse().map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="text-xs font-bold" style={{ color: POS_COLORS[s.position] }}>
                      {s.position}
                    </span>
                    <span className={`text-sm font-bold ${s.made ? "text-green-400" : "text-red-400"}`}>
                      {s.made ? "✓" : "✗"}
                    </span>
                    <span className="text-xs text-gray-500 ml-auto font-mono">
                      {formatTime(s.time_ms)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Save */}
          {log.length > 0 && (
            <div className="p-3 border-t border-gray-800 shrink-0">
              <button
                onClick={() => onSave(log, computeMakes())}
                disabled={saving}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm"
              >
                {saving ? "Saving…" : "Save Scores"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Make / Miss popover */}
      {popover && (
        <div
          data-popover
          className="fixed z-[60] flex flex-col gap-2 bg-gray-900 border border-gray-600 rounded-2xl shadow-2xl p-3"
          style={{
            left: Math.min(popover.screenX - 80, window.innerWidth - 200),
            top:  Math.max(popover.screenY - 80, 60),
          }}
        >
          <p className="text-xs text-gray-400 text-center font-medium">
            {POSITIONS.find((p) => p.id === popover.posId)?.pts}pt shot
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => recordShot(popover.posId, true)}
              className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold text-lg"
            >
              Make ✓
            </button>
            <button
              onClick={() => recordShot(popover.posId, false)}
              className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-lg"
            >
              Miss ✗
            </button>
          </div>
          <button
            onClick={() => setPopover(null)}
            className="text-xs text-gray-500 hover:text-gray-300 text-center"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
