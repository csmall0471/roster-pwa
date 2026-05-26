"use client"

import { useState } from "react"
import Link from "next/link"
import { track } from "@vercel/analytics"

export type CalEvent = {
  date: string
  time: string | null
  emoji: string
  label: string
  sublabel: string | null
  href: string
  playerIds: string[]
}

export type CalPlayer = {
  id: string
  firstName: string
}

const PLAYER_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4"]

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
}

export default function CalendarView({ events, players }: { events: CalEvent[]; players: CalPlayer[] }) {
  const todayStr = new Date().toISOString().split("T")[0]

  const [viewDate, setViewDate] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(todayStr)

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const playerColor = new Map(players.map((p, i) => [p.id, PLAYER_COLORS[i % PLAYER_COLORS.length]]))

  const eventsByDate = new Map<string, CalEvent[]>()
  for (const e of events) {
    if (!eventsByDate.has(e.date)) eventsByDate.set(e.date, [])
    eventsByDate.get(e.date)!.push(e)
  }

  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null)]
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  function toDateStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  }

  function dotColors(day: number): string[] {
    const evts = eventsByDate.get(toDateStr(day)) ?? []
    const seen = new Set<string>()
    const colors: string[] = []
    for (const e of evts) {
      for (const pid of e.playerIds) {
        const c = playerColor.get(pid) ?? "#9ca3af"
        if (!seen.has(c)) { seen.add(c); colors.push(c) }
      }
    }
    return colors
  }

  const selectedEvents = selectedDate ? (eventsByDate.get(selectedDate) ?? []) : []

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => { setViewDate(new Date(year, month - 1, 1)); track("calendar_month_changed", { direction: "prev" }); }}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-gray-900 dark:text-white">
          {viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </span>
        <button
          onClick={() => { setViewDate(new Date(year, month + 1, 1)); track("calendar_month_changed", { direction: "next" }); }}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-center text-[11px] font-medium text-gray-400 dark:text-gray-500 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const ds = toDateStr(day)
          const dots = dotColors(day)
          const isToday = ds === todayStr
          const isSelected = ds === selectedDate
          const isPast = ds < todayStr

          return (
            <button
              key={i}
              onClick={() => setSelectedDate(ds === selectedDate ? null : ds)}
              className={[
                "flex flex-col items-center justify-center rounded-lg py-1 text-sm font-medium transition-colors min-h-[40px]",
                isSelected
                  ? "bg-blue-600 text-white"
                  : isToday
                    ? "ring-1 ring-inset ring-blue-400 text-gray-900 dark:text-white"
                    : isPast
                      ? "text-gray-300 dark:text-gray-600"
                      : "text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800",
              ].join(" ")}
            >
              {day}
              {dots.length > 0 && (
                <div className="flex gap-px mt-0.5">
                  {dots.slice(0, 3).map((c, j) => (
                    <span
                      key={j}
                      style={{ background: isSelected ? "rgba(255,255,255,0.85)" : c }}
                      className="block w-1.5 h-1.5 rounded-full"
                    />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Player legend — only shown when 2+ kids */}
      {players.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          {players.map((p, i) => (
            <div key={p.id} className="flex items-center gap-1.5">
              <span
                style={{ background: PLAYER_COLORS[i % PLAYER_COLORS.length] }}
                className="block w-2.5 h-2.5 rounded-full shrink-0"
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">{p.firstName}</span>
            </div>
          ))}
        </div>
      )}

      {/* Selected date detail */}
      {selectedDate && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
              weekday: "long", month: "long", day: "numeric",
            })}
          </p>
          {selectedEvents.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">No events</p>
          ) : (
            <div className="space-y-2">
              {selectedEvents.map((ev, j) => (
                <Link
                  key={j}
                  href={ev.href}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <span className="text-base mt-0.5">{ev.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{ev.label}</p>
                    {ev.sublabel && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">{ev.sublabel}</p>
                    )}
                    {ev.time && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{fmtTime(ev.time)}</p>
                    )}
                  </div>
                  <div className="flex gap-1 items-start mt-1 shrink-0">
                    {[...new Set(ev.playerIds)].map((pid) => (
                      <span
                        key={pid}
                        style={{ background: playerColor.get(pid) ?? "#9ca3af" }}
                        className="block w-2 h-2 rounded-full"
                      />
                    ))}
                  </div>
                  <span className="text-gray-400 dark:text-gray-500 text-xs mt-0.5">→</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
