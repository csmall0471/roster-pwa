import { isNoRequest } from "../fields";
import { normalize, jaroWinkler } from "./similarity";

// Split a free-text buddy cell into name tokens. Handles the common separators
// seen in the data: commas, "&", and " and ".
function splitNames(cell: string): string[] {
  return cell
    .split(/,|&|\band\b/gi)
    .map((s) => s.trim())
    .filter((s) => s && !isNoRequest(s));
}

const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;

// Best-effort parse of the two buddy columns into candidate full-name strings.
// The data is messy (positional comma alignment, names jammed into one field,
// counts that don't match), so each candidate carries a `confidence` flag —
// low-confidence ones are exactly what the Claude pass should refine later.
export type BuddyCandidate = { name: string; confidence: "high" | "low" };

export function parseBuddyCell(firstCell: string, lastCell: string): BuddyCandidate[] {
  const first = isNoRequest(firstCell) ? "" : firstCell.trim();
  const last = isNoRequest(lastCell) ? "" : lastCell.trim();
  if (!first && !last) return [];

  const firstTokens = splitNames(first);
  const lastTokens = splitNames(last);

  // Equal-length multi-name lists → zip positionally (high confidence).
  if (firstTokens.length > 1 && firstTokens.length === lastTokens.length) {
    return firstTokens.map((f, i) => ({ name: `${f} ${lastTokens[i]}`.trim(), confidence: "high" as const }));
  }

  // One side is a list, the other a single shared surname/given name.
  if (firstTokens.length > 1 && lastTokens.length <= 1) {
    return firstTokens.map((f) => ({ name: `${f} ${last}`.trim(), confidence: last ? "high" : "low" }));
  }
  if (lastTokens.length > 1 && firstTokens.length <= 1) {
    // If the "last" tokens already look like full names, trust them as-is.
    const looksFull = lastTokens.every((t) => countWords(t) >= 2);
    return lastTokens.map((t) => ({
      name: looksFull ? t : `${first} ${t}`.trim(),
      confidence: looksFull ? "high" : first ? "high" : "low",
    }));
  }

  // Single buddy. The name might be split across the two cells, or fully in one.
  const combined = `${first} ${last}`.trim();
  const firstIsFull = countWords(first) >= 2;
  const lastIsFull = countWords(last) >= 2;
  if (first && last) return [{ name: combined, confidence: "high" }];
  if (firstIsFull) return [{ name: first, confidence: "high" }];
  if (lastIsFull) return [{ name: last, confidence: "high" }];
  // Only one bare token — a given name with no surname, or a stray surname.
  return [{ name: combined, confidence: "low" }];
}

export type RosterName = { index: number; first: string; last: string };

export type BuddyMatch = {
  fromIndex: number;
  rawName: string;
  toIndex: number | null; // matched roster player, or null if unresolved
  score: number;
  confidence: "high" | "low";
};

// Match a candidate buddy name against the roster by full-name similarity.
export function matchBuddy(
  candidate: string,
  roster: RosterName[],
  selfIndex: number,
  threshold = 0.86
): { index: number | null; score: number } {
  const target = normalize(candidate);
  if (!target) return { index: null, score: 0 };
  let bestIndex: number | null = null;
  let bestScore = threshold;
  for (const r of roster) {
    if (r.index === selfIndex) continue;
    const full = normalize(`${r.first} ${r.last}`);
    const score = jaroWinkler(target, full);
    if (score >= bestScore) {
      bestScore = score;
      bestIndex = r.index;
    }
  }
  return { index: bestIndex, score: bestIndex === null ? 0 : bestScore };
}
