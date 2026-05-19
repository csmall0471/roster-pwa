"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import type { ShotLogEntry } from "../actions"
import { formatTime, hotShotsTotal } from "../utils"

type Position = {
  id:    ShotLogEntry["position"]
  pts:   number
  max:   number
  label: string
  cx:    number
  cy:    number
  r:     number
}

const POSITIONS: Position[] = [
  { id: "8pt", pts: 8, max: 10, label: "8",  cx:  62, cy: 95,  r: 32 },
  { id: "7pt", pts: 7, max: 10, label: "7",  cx: 328, cy: 95,  r: 32 },
  { id: "5pt", pts: 5, max: 10, label: "5",  cx: 195, cy: 170, r: 32 },
  { id: "3pt", pts: 3, max: 10, label: "3",  cx: 310, cy: 255, r: 30 },
  { id: "2pt", pts: 2, max: 8,  label: "2",  cx:  80, cy: 255, r: 30 },
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

type Props = {
  initialLog: ShotLogEntry[] | null
  saving:     boolean
  onSave:     (
    log: ShotLogEntry[],
    makes: { hot_shots_8pt: number; hot_shots_7pt: number; hot_shots_5pt: number; hot_shots_3pt: number; hot_shots_2pt: number }
  ) => void
}

export default function HotShotsScorer({ initialLog, saving, onSave }: Props) {
  const [log, setLog]               = useState<ShotLogEntry[]>(initialLog ?? [])
  const [mode, setMode]             = useState<"make" | "miss">("make")
  const [timerStatus, setTimerStatus] = useState<TimerState>("idle")
  const [timerMs, setTimerMs]       = useState(DEFAULT_TIMER_MS)    // countdown from
  const [remaining, setRemaining]   = useState(DEFAULT_TIMER_MS)    // live remaining
  const [editingTimer, setEditingTimer] = useState(false)
  const [editMin, setEditMin]       = useState("1")
  const [editSec, setEditSec]       = useState("00")
  const [shotElapsed, setShotElapsed] = useState(0)                 // stopwatch for each shot time

  const startRef     = useRef<number | null>(null)  // countdown start
  const shotStartRef = useRef<number | null>(null)  // when countdown started (for shot times)
  const rafRef       = useRef<number | null>(null)

  const tick = useCallback(() => {
    if (startRef.current == null) return
    const elapsed = performance.now() - startRef.current
    const rem = Math.max(0, timerMs - elapsed)
    setRemaining(rem)
    setShotElapsed(elapsed)
    if (rem <= 0) {
      setTimerStatus("ended")
      return
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [timerMs])

  function startTimer() {
    startRef.current = performance.now() - (timerMs - remaining)
    shotStartRef.current = performance.now() - (timerMs - remaining)
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
    shotStartRef.current = null
    setRemaining(timerMs)
    setShotElapsed(0)
    setLog([])
    setTimerStatus("idle")
  }

  function applyTimerEdit() {
    const mins = parseInt(editMin) || 0
    const secs = parseInt(editSec) || 0
    const ms = (mins * 60 + secs) * 1000
    if (ms > 0) {
      setTimerMs(ms)
      setRemaining(ms)
    }
    setEditingTimer(false)
  }

  function recordShot(pos: Position) {
    if (timerStatus !== "running") return
    const makeCount = log.filter((s) => s.position === pos.id && s.made).length
    if (mode === "make" && makeCount >= pos.max) return // at max makes

    const elapsed = Math.round(performance.now() - (shotStartRef.current ?? 0))
    const entry: ShotLogEntry = {
      position: pos.id,
      made:     mode === "make",
      time_ms:  elapsed,
      order:    log.length + 1,
    }
    setLog((prev) => [...prev, entry])
  }

  function undoLast() {
    setLog((prev) => prev.slice(0, -1))
  }

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  // Rerun tick when timerMs changes (so the closure captures updated value)
  useEffect(() => {
    if (timerStatus === "running") {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
  }, [tick, timerStatus])

  // Per-position stats from log
  function posStats(posId: ShotLogEntry["position"]) {
    const posShots = log.filter((s) => s.position === posId)
    return { makes: posShots.filter((s) => s.made).length, total: posShots.length }
  }

  // Compute makes map for save
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
  const canShoot = timerStatus === "running"
  const isEnded  = timerStatus === "ended"

  // Countdown display color
  const pct = remaining / timerMs
  const timerColor = pct > 0.4 ? "#4ade80" : pct > 0.2 ? "#facc15" : "#f87171"

  return (
    <div className="h-full flex flex-col bg-gray-950 select-none">

      {/* Controls bar */}
      <div className="flex items-center gap-3 px-3 py-2 bg-gray-900 border-b border-gray-800 shrink-0 flex-wrap">

        {/* Countdown timer */}
        <div className="flex items-center gap-2">
          {editingTimer ? (
            <div className="flex items-center gap-1">
              <input
                value={editMin}
                onChange={(e) => setEditMin(e.target.value)}
                className="w-10 text-center bg-gray-800 text-white text-sm rounded px-1 py-0.5 border border-gray-600"
                maxLength={2}
              />
              <span className="text-gray-400 font-bold">:</span>
              <input
                value={editSec}
                onChange={(e) => setEditSec(e.target.value)}
                className="w-10 text-center bg-gray-800 text-white text-sm rounded px-1 py-0.5 border border-gray-600"
                maxLength={2}
              />
              <button onClick={applyTimerEdit} className="text-xs bg-blue-700 hover:bg-blue-600 text-white px-2 py-1 rounded">Set</button>
              <button onClick={() => setEditingTimer(false)} className="text-xs text-gray-400 hover:text-white px-1 py-1">✕</button>
            </div>
          ) : (
            <button
              onClick={() => { if (timerStatus === "idle") setEditingTimer(true) }}
              disabled={timerStatus !== "idle"}
              className="font-mono text-2xl font-bold tracking-wide disabled:cursor-default"
              style={{ color: timerColor }}
            >
              {formatTime(remaining)}
            </button>
          )}
        </div>

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
            <button onClick={undoLast} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs">Undo</button>
          )}
        </div>

        {/* Make / Miss toggle */}
        <div className="flex rounded-lg overflow-hidden border border-gray-700 ml-auto">
          <button
            onClick={() => setMode("make")}
            className={`px-4 py-1.5 text-sm font-bold transition-colors ${
              mode === "make" ? "bg-green-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            MAKE
          </button>
          <button
            onClick={() => setMode("miss")}
            className={`px-4 py-1.5 text-sm font-bold transition-colors ${
              mode === "miss" ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            MISS
          </button>
        </div>
      </div>

      {/* Court + log */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">

        {/* SVG Court */}
        <div className="flex-1 min-h-0 flex items-center justify-center p-2">
          <svg
            viewBox="0 0 390 310"
            className="h-full max-h-full w-auto"
            style={{ maxHeight: "100%", maxWidth: "100%" }}
          >
            {/* Court surface */}
            <rect x="0" y="0" width="390" height="310" fill="#c8a96e" />
            <rect x="5" y="5" width="380" height="300" fill="none" stroke="white" strokeWidth="3" />

            {/* Key / paint (basket at bottom center) */}
            <rect x="140" y="130" width="110" height="175" fill="rgba(180,120,40,0.35)" stroke="white" strokeWidth="2" />

            {/* Free throw line */}
            <line x1="140" y1="130" x2="250" y2="130" stroke="white" strokeWidth="2" />

            {/* Free throw circle (upper half) */}
            <path d="M 140 130 A 55 55 0 0 0 250 130" fill="none" stroke="white" strokeWidth="2" />

            {/* Three-point arc */}
            <path d="M 22 305 A 178 178 0 0 1 368 305" fill="none" stroke="white" strokeWidth="2" />

            {/* Backboard (at bottom) */}
            <rect x="162" y="293" width="66" height="9" fill="none" stroke="white" strokeWidth="3" />

            {/* Rim */}
            <circle cx="195" cy="285" r="14" fill="none" stroke="#ef4444" strokeWidth="2.5" />

            {/* Lane lines */}
            <line x1="140" y1="175" x2="140" y2="305" stroke="white" strokeWidth="1" strokeDasharray="8,6" />
            <line x1="250" y1="175" x2="250" y2="305" stroke="white" strokeWidth="1" strokeDasharray="8,6" />

            {/* Shot position zones */}
            {POSITIONS.map((pos) => {
              const stats = posStats(pos.id)
              const isActive = canShoot
              const color = POS_COLORS[pos.id]
              const lastShot = [...log].reverse().find((s) => s.position === pos.id)

              return (
                <g
                  key={pos.id}
                  onClick={() => recordShot(pos)}
                  style={{ cursor: isActive ? "pointer" : "default" }}
                >
                  {/* Tap ripple effect (shown when active mode) */}
                  {isActive && (
                    <circle cx={pos.cx} cy={pos.cy} r={pos.r + 12} fill={color} opacity="0.15" />
                  )}

                  <circle
                    cx={pos.cx}
                    cy={pos.cy}
                    r={pos.r}
                    fill={color}
                    opacity={isActive ? 0.9 : 0.5}
                    stroke={isActive ? "white" : "rgba(255,255,255,0.3)"}
                    strokeWidth={isActive ? 2.5 : 1.5}
                  />

                  {/* Point value */}
                  <text x={pos.cx} y={pos.cy - 7} textAnchor="middle" fill="white" fontSize="17" fontWeight="bold">
                    {pos.label}
                  </text>
                  <text x={pos.cx} y={pos.cy + 5} textAnchor="middle" fill="white" fontSize="8">
                    pts
                  </text>

                  {/* Makes / attempts counter */}
                  <text x={pos.cx} y={pos.cy + 17} textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">
                    {stats.makes}/{stats.total}
                  </text>

                  {/* Last shot indicator */}
                  {lastShot && (
                    <text
                      x={pos.cx + pos.r + 4}
                      y={pos.cy - pos.r + 10}
                      fill={lastShot.made ? "#4ade80" : "#f87171"}
                      fontSize="14"
                      fontWeight="bold"
                    >
                      {lastShot.made ? "✓" : "✗"}
                    </text>
                  )}
                </g>
              )
            })}

            {/* "ENDED" overlay */}
            {isEnded && (
              <>
                <rect x="95" y="120" width="200" height="60" rx="10" fill="rgba(0,0,0,0.75)" />
                <text x="195" y="148" textAnchor="middle" fill="#facc15" fontSize="16" fontWeight="bold">Time's up!</text>
                <text x="195" y="168" textAnchor="middle" fill="white" fontSize="12">{totalPts} pts total</text>
              </>
            )}

            {/* Mode indicator on court */}
            {canShoot && (
              <rect
                x="5" y="5" width="380" height="300"
                fill="none"
                stroke={mode === "make" ? "#4ade80" : "#f87171"}
                strokeWidth="4"
                opacity="0.6"
              />
            )}
          </svg>
        </div>

        {/* Shot log + summary */}
        <div className="md:w-52 shrink-0 bg-gray-900 border-t md:border-t-0 md:border-l border-gray-800 overflow-y-auto flex flex-col">
          {/* Score summary */}
          <div className="p-3 border-b border-gray-800 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Score</p>
              <span className="text-lg font-bold text-white">{totalPts}pts</span>
            </div>
            <div className="grid grid-cols-5 gap-0.5">
              {POSITIONS.map((pos) => {
                const stats = posStats(pos.id)
                return (
                  <div key={pos.id} className="text-center">
                    <div className="text-xs font-bold" style={{ color: POS_COLORS[pos.id] }}>{pos.label}pt</div>
                    <div className="text-xs text-white font-mono">{stats.makes}/{stats.total}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Shot log */}
          <div className="flex-1 overflow-y-auto p-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Shot Log</p>
            {log.length === 0 ? (
              <p className="text-xs text-gray-600 italic">
                {timerStatus === "idle"
                  ? "Start the timer, then tap a position."
                  : "Tap a shot position."}
              </p>
            ) : (
              <div className="space-y-1">
                {[...log].reverse().map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className={`text-sm font-bold ${s.made ? "text-green-400" : "text-red-400"}`}>
                      {s.made ? "✓" : "✗"}
                    </span>
                    <span className="text-xs font-bold" style={{ color: POS_COLORS[s.position] }}>
                      {s.position}
                    </span>
                    <span className="text-xs text-gray-500 ml-auto font-mono">{formatTime(s.time_ms)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Save button */}
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
    </div>
  )
}
