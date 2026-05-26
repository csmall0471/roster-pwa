export type ParsedEvent = {
  summary: string;
  location: string | null;
  notes: string | null;
  // Derived from DTSTART, converted to browser local time
  game_date: string;   // YYYY-MM-DD
  game_time: string | null; // HH:MM (null if date-only event)
  // Classified fields
  event_type: "game" | "practice" | "other";
  title: string | null;    // for practice/other
  opponent: string | null; // for games
  is_home: boolean;
};

// Unfold RFC 5545 content lines (continuation lines start with space or tab)
function unfold(raw: string): string[] {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n");
}

// Parse DTSTART value: handles YYYYMMDD, YYYYMMDDTHHmmss, YYYYMMDDTHHmmssZ
function parseDtstart(value: string): { date: string; time: string | null } {
  const v = value.trim();
  const dateOnly = /^\d{8}$/.test(v);
  if (dateOnly) {
    const d = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
    return { date: d, time: null };
  }
  // datetime — use Date to convert UTC to local
  const iso = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T${v.slice(9, 11)}:${v.slice(11, 13)}:${v.slice(13, 15)}${v.endsWith("Z") ? "Z" : ""}`;
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return { date: v.slice(0, 10), time: null };
  const date = dt.toLocaleDateString("en-CA"); // YYYY-MM-DD
  const h = dt.getHours().toString().padStart(2, "0");
  const m = dt.getMinutes().toString().padStart(2, "0");
  const time = h === "00" && m === "00" ? null : `${h}:${m}`;
  return { date, time };
}

// Unescape ICS text: \, → , and \n → space, strip trailing URL lines
function cleanText(raw: string): string {
  return raw
    .replace(/\\,/g, ",")
    .replace(/\\n/g, " ")
    .replace(/\\N/g, " ")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Keep only the first line of a location (venue name, drop address)
function cleanLocation(raw: string): string {
  const cleaned = cleanText(raw);
  // ICS uses \n (literal two chars) for multi-line — already collapsed above,
  // so also split on actual newlines that survived
  return cleaned.split(/\n/)[0].trim();
}

// Classify event from SUMMARY
function classify(summary: string): Pick<ParsedEvent, "event_type" | "title" | "opponent" | "is_home"> {
  const s = summary.trim();
  const lower = s.toLowerCase();

  // Mojo format: "Game: AWAY vs TBD (Arrive 5 min Early)"
  const mojoGame = s.match(/^Game:\s*(HOME|AWAY)\s+vs\s+(.+?)(?:\s*\(|$)/i);
  if (mojoGame) {
    const isHome = mojoGame[1].toUpperCase() === "HOME";
    const opp = mojoGame[2].trim() || "TBD";
    return { event_type: "game", title: null, opponent: opp, is_home: isHome };
  }

  // Generic "vs Opponent" → home game
  const vsMatch = s.match(/\bvs\.?\s+(.+)/i);
  if (vsMatch) {
    return { event_type: "game", title: null, opponent: vsMatch[1].trim(), is_home: true };
  }

  // Generic "@ Opponent" or "at Opponent" → away game
  const awayMatch = s.match(/^(?:@|at)\s+(.+)/i);
  if (awayMatch) {
    return { event_type: "game", title: null, opponent: awayMatch[1].trim(), is_home: false };
  }

  // "game" keyword anywhere
  if (lower.includes("game")) {
    return { event_type: "game", title: s, opponent: null, is_home: true };
  }

  // Practice
  if (lower.includes("practice") || lower.includes("workout") || lower.includes("training")) {
    return { event_type: "practice", title: s, opponent: null, is_home: true };
  }

  return { event_type: "other", title: s, opponent: null, is_home: true };
}

export function parseIcs(text: string): ParsedEvent[] {
  const lines = unfold(text);
  const events: ParsedEvent[] = [];

  let inEvent = false;
  let props: Record<string, string> = {};

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      props = {};
      continue;
    }
    if (line === "END:VEVENT") {
      inEvent = false;
      const raw = props;

      // Get DTSTART value (param may appear as DTSTART;TZID=... or DTSTART;VALUE=DATE)
      const dtRaw = Object.entries(raw).find(([k]) => k.startsWith("DTSTART"))?.[1] ?? "";
      if (!dtRaw) continue;

      const { date, time } = parseDtstart(dtRaw);
      const summary = cleanText(raw["SUMMARY"] ?? "");
      if (!summary && !date) continue;

      const loc = raw["LOCATION"] ? cleanLocation(raw["LOCATION"]) : null;
      const desc = raw["DESCRIPTION"] ? cleanText(raw["DESCRIPTION"]) : null;

      const classified = classify(summary);

      events.push({
        summary,
        location: loc || null,
        notes: desc || null,
        game_date: date,
        game_time: time,
        ...classified,
      });
      continue;
    }

    if (!inEvent) continue;

    // Parse property name (may include params like DTSTART;TZID=...)
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).split(";")[0].toUpperCase();
    const value = line.slice(colon + 1);
    // Store with full key for DTSTART param detection
    const fullKey = line.slice(0, colon).toUpperCase();
    props[key] = value;
    if (fullKey !== key) props[fullKey] = value;
  }

  return events.sort((a, b) => a.game_date.localeCompare(b.game_date));
}
