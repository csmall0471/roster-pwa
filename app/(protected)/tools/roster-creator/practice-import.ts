import { normalize } from "./resolve/similarity";

// Parse a league "practice times" spreadsheet (Google Sheet or uploaded file)
// and match each cell to a team in this season. Pure — no DB, no React, usable
// on client or server.
//
// The expected layout is a grid: paired columns per weekday, each
// [Practice Time | Coach Name & Age Group], with one row per time slot. Coach
// cells mix name + age group + gender, e.g. "Connor Small 8U Boys",
// "T. Linsacum 12U BFlag", "Erin Balcome - 12U girls". Lots of blank cells.

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export type PracticeSlot = { day: string; time: string | null; label: string };

// A team as the matcher needs it (coach + age-group label come from the board).
export type TeamLite = { id: string; coach: string; divisionName: string };

// Turn an edit/share URL (or a bare ID) into the CSV-export URL for its tab.
export function sheetToCsvUrl(url: string): string | null {
  const trimmed = (url || "").trim();
  const idMatch =
    trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/) ||
    trimmed.match(/^([a-zA-Z0-9-_]{30,})$/);
  if (!idMatch) return null;
  const gidMatch = trimmed.match(/[#&?]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";
  return `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv&gid=${gid}`;
}

// "5:00 PM" / "5 PM" / "17:00" → "HH:MM" 24h (the schedule's stored format).
export function parseSheetTime(raw: string): string | null {
  const s = (raw || "").trim();
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?/i) || s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = (m[3] || "").toLowerCase();
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function parsePracticeGrid(matrix: string[][]): PracticeSlot[] {
  // Find the row that names the weekdays (the day header).
  let hdr = -1;
  for (let i = 0; i < Math.min(matrix.length, 12); i++) {
    const row = matrix[i] ?? [];
    if (row.some((c) => DAYS.some((d) => d.toLowerCase() === (c ?? "").toString().trim().toLowerCase()))) {
      hdr = i;
      break;
    }
  }
  if (hdr === -1) return [];

  // Each named day owns its column (the time) and the next column (the label).
  const dayCols: { col: number; day: string }[] = [];
  (matrix[hdr] ?? []).forEach((c, col) => {
    const day = DAYS.find((d) => d.toLowerCase() === (c ?? "").toString().trim().toLowerCase());
    if (day) dayCols.push({ col, day });
  });

  const slots: PracticeSlot[] = [];
  for (let i = hdr + 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    for (const { col, day } of dayCols) {
      const timeCell = (row[col] ?? "").toString().trim();
      const label = (row[col + 1] ?? "").toString().trim();
      if (!label) continue;
      if (/^practice\s*time$/i.test(timeCell)) continue; // the sub-header row
      slots.push({ day, time: parseSheetTime(timeCell), label });
    }
  }
  return slots;
}

// ── Matching ─────────────────────────────────────────────────────────────────

function ageToken(s: string): string | null {
  const m = s.match(/\b(\d{1,2})\s*u\b/i) || s.match(/\bu\s*(\d{1,2})\b/i);
  return m ? `${parseInt(m[1], 10)}U` : null;
}

function genderToken(s: string): "Boys" | "Girls" | null {
  if (/\bgirls?\b/i.test(s) || /\bpixies\b/i.test(s)) return "Girls";
  if (/\bboys?\b/i.test(s)) return "Boys";
  return null;
}

// Alpha name tokens with age/gender/league words stripped, lowercased.
function nameTokens(label: string): string[] {
  return label
    .replace(/\b\d{1,2}\s*u\b/gi, " ")
    .replace(/\bu\s*\d{1,2}\b/gi, " ")
    .replace(/\b(boys?|girls?|flag|rec|advanced|pixies|coed|[bg]\s*flag|[bg]flag|th|st|nd|rd)\b/gi, " ")
    .replace(/[^a-z\s.]/gi, " ")
    .toLowerCase()
    .split(/[\s.]+/)
    .filter((t) => t.length > 1);
}

function scoreMatch(team: TeamLite, slot: PracticeSlot): number {
  const tTokens = nameTokens(team.coach || "");
  if (tTokens.length === 0) return 0;
  const sTokens = nameTokens(slot.label);
  const tLast = tTokens[tTokens.length - 1];
  // Require the coach's last name to appear, so we don't match on age alone.
  if (!sTokens.includes(tLast)) return 0;
  let score = 3;
  if (tTokens.length > 1 && sTokens.includes(tTokens[0])) score += 1;
  const tAge = ageToken(team.divisionName);
  const sAge = ageToken(slot.label);
  if (tAge && sAge) score += tAge === sAge ? 2 : -2;
  const tG = genderToken(team.divisionName);
  const sG = genderToken(slot.label);
  if (tG && sG) score += tG === sG ? 1 : -1;
  return score;
}

// ── Sheet → season structure ─────────────────────────────────────────────────
// The same grid that carries practice times also names a coach + age group +
// gender per cell, so it can seed divisions / coaches / teams (with their day &
// time) before the analyzer runs — used alongside (or instead of) a coach file.

// The coach name with the age/gender/league words stripped, original case kept.
function cleanCoachName(label: string): string {
  return label
    .replace(/\b\d{1,2}\s*u\b/gi, " ")
    .replace(/\bu\s*\d{1,2}\b/gi, " ")
    .replace(/\b(boys?|girls?|flag|rec|advanced|pixies|coed|[bg]\s*flag|[bg]flag)\b/gi, " ")
    .replace(/[-–—/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Division label from a cell: "8U Boys", "12U Girls", "6U", or "Unsorted".
function divisionLabel(label: string): string {
  const parts = [ageToken(label), genderToken(label)].filter(Boolean);
  return parts.length ? parts.join(" ") : "Unsorted";
}

export type SheetTeam = { coachName: string; day: string | null; time: string | null };
export type SheetDivision = { name: string; teams: SheetTeam[] };

// Group the grid's cells into divisions → one team per coach (with their first
// day/time). A coach appearing in two age groups becomes two teams.
export function slotsToStructure(slots: PracticeSlot[]): SheetDivision[] {
  const byDiv = new Map<string, Map<string, SheetTeam>>();
  for (const s of slots) {
    const coachName = cleanCoachName(s.label);
    if (!coachName) continue;
    const dn = divisionLabel(s.label);
    if (!byDiv.has(dn)) byDiv.set(dn, new Map());
    const teams = byDiv.get(dn)!;
    const key = normalize(coachName);
    if (!teams.has(key)) teams.set(key, { coachName, day: s.day, time: s.time });
  }
  return [...byDiv.entries()]
    .map(([name, teams]) => ({ name, teams: [...teams.values()] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type SlotMatch = { slot: PracticeSlot; score: number };

// Best slot per team — greedy by score, each slot and team used at most once
// (so a coach with an 8U and a 10U team get their two different slots).
export function matchPracticeSlots(teams: TeamLite[], slots: PracticeSlot[]): Map<string, SlotMatch> {
  const pairs: { teamId: string; slotIdx: number; score: number }[] = [];
  teams.forEach((t) =>
    slots.forEach((s, idx) => {
      const score = scoreMatch(t, s);
      if (score > 0) pairs.push({ teamId: t.id, slotIdx: idx, score });
    })
  );
  pairs.sort((a, b) => b.score - a.score);

  const usedSlot = new Set<number>();
  const usedTeam = new Set<string>();
  const out = new Map<string, SlotMatch>();
  for (const p of pairs) {
    if (usedTeam.has(p.teamId) || usedSlot.has(p.slotIdx)) continue;
    usedTeam.add(p.teamId);
    usedSlot.add(p.slotIdx);
    out.set(p.teamId, { slot: slots[p.slotIdx], score: p.score });
  }
  return out;
}
