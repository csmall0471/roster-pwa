// Duo/trio card helpers. A card can hold up to MAX_SUBJECTS players: the primary
// player on the top-level CardDesign fields plus MAX_EXTRA additional subjects.

export const MAX_SUBJECTS = 4;
export const MAX_EXTRA = MAX_SUBJECTS - 1;

// Sensible starting questions for the shared duo/trio back. Fully editable per
// card; sport-neutral so they fit any team.
export const DEFAULT_DUO_QUESTIONS = [
  "Duo nickname",
  "Best combo play",
  "Who's more clutch",
  "Who's louder",
  "How they met",
  "Hype song",
];

// Join names for the shared plate / back title: "CJ", "CJ & ALEX",
// "CJ, ALEX & JON".
export function joinNames(names: string[]): string {
  const n = names.map((s) => s.trim()).filter(Boolean);
  if (n.length === 0) return "";
  if (n.length === 1) return n[0];
  if (n.length === 2) return `${n[0]} & ${n[1]}`;
  return `${n.slice(0, -1).join(", ")} & ${n[n.length - 1]}`;
}
