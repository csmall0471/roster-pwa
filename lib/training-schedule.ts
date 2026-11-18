// How a training series' dates/times read in one line, shared by the coach and
// parent series headers.

type Dated = { session_date: string; session_time: string | null; session_end_time: string | null }

const DAY_PLURAL = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"]

export function fmtTime(t: string | null) {
  if (!t) return null
  const [h, m] = t.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
}

function timeRange(s: Dated): string | null {
  const t = fmtTime(s.session_time)
  const e = fmtTime(s.session_end_time)
  return t ? (e ? `${t} – ${e}` : t) : null
}

const dayOf = (iso: string) => new Date(iso + "T00:00:00").getDay()
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86_400_000)

/** True when every weekday in the series repeats every week with no gaps. */
export function isWeeklySeries(sessions: Dated[]): boolean {
  const byDay = new Map<number, string[]>()
  for (const s of sessions) {
    const d = dayOf(s.session_date)
    byDay.set(d, [...(byDay.get(d) ?? []), s.session_date])
  }
  for (const dates of byDay.values()) {
    dates.sort()
    for (let i = 1; i < dates.length; i++) if (daysBetween(dates[i - 1], dates[i]) !== 7) return false
  }
  return true
}

/**
 * "Tuesdays 5:30 PM – 6:30 PM / Thursdays 6:00 PM" for a weekly series;
 * for hand-picked dates just the time(s): "5:30 PM – 6:30 PM", or
 * "Times vary" when there are more than two different times.
 */
export function seriesTimesSummary(sessions: Dated[]): string | null {
  if (sessions.length === 0) return null
  if (sessions.length === 1) return timeRange(sessions[0])

  if (isWeeklySeries(sessions)) {
    const map = new Map<number, string>()
    for (const s of sessions) {
      const day = dayOf(s.session_date)
      const t = timeRange(s)
      if (!map.has(day) && t) map.set(day, t)
    }
    if (map.size === 0) return null
    return [...map.entries()].sort(([a], [b]) => a - b).map(([day, t]) => `${DAY_PLURAL[day]} ${t}`).join(" / ")
  }

  const times = [...new Set(sessions.map(timeRange).filter((t): t is string => !!t))]
  if (times.length === 0) return null
  return times.length <= 2 ? times.join(" / ") : "Times vary — see each date"
}
