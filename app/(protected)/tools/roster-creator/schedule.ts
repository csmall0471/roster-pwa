// Practice-schedule config + time helpers. Pure — no DB, no React.

export type ScheduleConfig = {
  fields: string[]; // named practice locations (grid columns)
  start: string; // "HH:MM" 24h — first slot
  end: string; // "HH:MM" 24h — last slot start (exclusive end)
  slot: number; // slot length in minutes
};

export const DEFAULT_SCHEDULE: ScheduleConfig = {
  fields: [],
  start: "17:00",
  end: "21:00",
  slot: 60,
};

export function normalizeSchedule(
  raw: (Partial<ScheduleConfig> & Record<string, unknown>) | null | undefined
): ScheduleConfig {
  return {
    fields: Array.isArray(raw?.fields) ? (raw!.fields as string[]).filter(Boolean) : DEFAULT_SCHEDULE.fields,
    start: typeof raw?.start === "string" && raw.start ? raw.start : DEFAULT_SCHEDULE.start,
    end: typeof raw?.end === "string" && raw.end ? raw.end : DEFAULT_SCHEDULE.end,
    slot: typeof raw?.slot === "number" && raw.slot > 0 ? raw.slot : DEFAULT_SCHEDULE.slot,
  };
}

const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
};
const toHHMM = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

// The row labels: every slot from start up to (but not including) end.
export function timeSlots(cfg: ScheduleConfig): string[] {
  const out: string[] = [];
  const start = toMin(cfg.start);
  const end = toMin(cfg.end);
  const step = Math.max(5, cfg.slot);
  for (let t = start; t < end && out.length < 48; t += step) out.push(toHHMM(t));
  return out;
}

// "17:30" -> "5:30 PM"
export function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, "0")} ${period}`;
}
