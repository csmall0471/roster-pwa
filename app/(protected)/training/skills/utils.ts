import type { SkillsAttempt } from "./actions"

export function hotShotsTotal(a: Pick<SkillsAttempt, "hot_shots_8pt" | "hot_shots_7pt" | "hot_shots_5pt" | "hot_shots_3pt" | "hot_shots_2pt">): number {
  return a.hot_shots_8pt * 8 + a.hot_shots_7pt * 7 + a.hot_shots_5pt * 5 + a.hot_shots_3pt * 3 + a.hot_shots_2pt * 2
}

export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const centiseconds = Math.floor((ms % 1000) / 10)
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`
}
