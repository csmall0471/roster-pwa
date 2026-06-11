// Minimal RFC-4180 CSV serializer (pure). Quotes fields containing commas,
// quotes, or newlines and escapes embedded quotes.

function escapeCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((cells) => cells.map(escapeCell).join(","));
  return lines.join("\r\n");
}

export type RosterRow = {
  // ── The roster itself (handoff columns) ──
  division: string;
  team: string;
  night: string;
  time: string; // formatted practice time, e.g. "6:00 PM"
  field: string; // practice field/location
  first: string;
  last: string;
  age: string;
  school: string;
  // ── Request-vs-result audit (trailing columns) ──
  coachReq: string; // coach the family requested (canonical), "" if none
  coachAssigned: string; // dominant coach of the team they landed on
  coachMet: string; // Yes / No / "" (no request)
  teamReq: string; // team name requested (canonical)
  teamMet: string; // Yes / No / ""
  buddiesReq: string; // how many buddies they named
  buddiesWith: string; // how many of those are on the same team
  buddiesMet: string; // Yes / No / ""
  nightsFree: string; // nights the family said they're available
  nightMet: string; // Yes / No / "" (no team night or no availability given)
  role: string; // Requester / Filled / "" (unassigned)
  coachChild: string; // "Yes" when this is the coach's own child, else ""
};

export const ROSTER_HEADERS = [
  "Division",
  "Team",
  "Practice night",
  "Practice time",
  "Field",
  "First name",
  "Last name",
  "Age group",
  "School",
  "Coach requested",
  "Coach assigned",
  "Coach met?",
  "Team requested",
  "Team met?",
  "Buddies requested",
  "Buddies on team",
  "Buddies met?",
  "Practice nights free",
  "Practice night met?",
  "Role",
  "Coach's kid",
];

export function rosterToCsv(rows: RosterRow[]): string {
  return toCsv(
    ROSTER_HEADERS,
    rows.map((r) => [
      r.division,
      r.team,
      r.night,
      r.time,
      r.field,
      r.first,
      r.last,
      r.age,
      r.school,
      r.coachReq,
      r.coachAssigned,
      r.coachMet,
      r.teamReq,
      r.teamMet,
      r.buddiesReq,
      r.buddiesWith,
      r.buddiesMet,
      r.nightsFree,
      r.nightMet,
      r.role,
      r.coachChild,
    ])
  );
}
