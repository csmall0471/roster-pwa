// Detect age/gender hints in free text so we can flag players whose request
// points at a different division than the one they enrolled in (e.g. a kid in
// "Peoria 8U Boys" whose team request says "SHOWTIME U10 team").

export type DivisionHint = { age: number | null; gender: "boys" | "girls" | null };

// Pull an age-bracket number from text: "U10", "10U", "10u team", etc.
export function extractAge(text: string): number | null {
  const m = text.match(/\bu\s*(\d{1,2})\b/i) || text.match(/\b(\d{1,2})\s*u\b/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 4 && n <= 19 ? n : null;
}

export function extractGender(text: string): "boys" | "girls" | null {
  if (/\b(girls?|female)\b/i.test(text)) return "girls";
  if (/\b(boys?|male)\b/i.test(text)) return "boys";
  return null;
}

export function extractHint(...texts: string[]): DivisionHint {
  const joined = texts.filter(Boolean).join(" ");
  return { age: extractAge(joined), gender: extractGender(joined) };
}

// A cross-division flag: the request mentions an age bracket that differs from
// the player's enrolled bracket.
export type CrossDivisionFlag = {
  playerIndex: number;
  enrolledAge: number | null;
  hintedAge: number;
  source: string; // the text the hint came from
};

// Compare a request hint against the enrolled age (parsed from package_name).
export function crossDivisionFlag(
  playerIndex: number,
  enrolledPackage: string,
  ...requestTexts: string[]
): CrossDivisionFlag | null {
  const hint = extractHint(...requestTexts);
  if (hint.age == null) return null;
  const enrolledAge = extractAge(enrolledPackage);
  if (enrolledAge == null || hint.age === enrolledAge) return null;
  return {
    playerIndex,
    enrolledAge,
    hintedAge: hint.age,
    source: requestTexts.filter(Boolean).join(" "),
  };
}
