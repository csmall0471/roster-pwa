import { normalize, jaroWinkler } from "./similarity";

// One-sided coach resolution: match a single parent's (already cleaned, roughly
// "First Last") coach request against an authoritative, admin-uploaded list of
// the coaches in that player's division. This replaces the old discover-by-
// clustering approach — the candidate set is now KNOWN, so we just pick the best
// fit (or flag it for human review when we can't safely choose).
//
// Pure & deterministic: no DB, no API, no I/O. Built only on normalize() +
// jaroWinkler() from ./similarity.

export type CoachCandidate = { id: string; name: string };

export type CoachMatch = { coachId: string; score: number; ambiguous: boolean } | null;

// --- Thresholds -------------------------------------------------------------
//
// DEFAULT_THRESHOLD (0.84): the minimum overall score for a request to "clear"
// and resolve to a candidate. Jaro-Winkler runs hot for names that share a
// prefix, so 0.84 is comfortably above coincidental overlap yet forgiving of
// nicknames/typos ("Jon" vs "Jonathan", "Clissold" vs "Clisold"). Below this we
// return null (no honored request) rather than guess.
const DEFAULT_THRESHOLD = 0.84;

// A single-token request (bare surname or bare first name) is matched against
// each candidate's last name and first name separately. SURNAME_STRONG (0.9) is
// the bar at which a surname match is treated as a confident, specific signal —
// high enough that "Wilson" won't accidentally bind to "Williams".
const SURNAME_STRONG = 0.9;

// When a first name is present, this is how well it must match a candidate's
// first name to be considered a real disambiguator (e.g. resolving which of two
// same-surname Wilsons the parent meant).
const FIRST_NAME_MATCH = 0.85;

const tokens = (s: string): string[] => s.split(" ").filter(Boolean);
const firstToken = (s: string): string => tokens(s)[0] ?? "";
const lastToken = (s: string): string => {
  const t = tokens(s);
  return t[t.length - 1] ?? "";
};

// Per-candidate score for a request, plus enough surname bookkeeping that the
// caller can apply the shared-surname guard.
type Scored = {
  candidate: CoachCandidate;
  score: number; // best overall score we could justify for this candidate
  surname: string; // candidate's normalized last name
  surnameHit: boolean; // request's surname strongly matches this candidate's surname
  firstHit: boolean; // request's first name strongly matches this candidate's first name
};

function scoreCandidate(
  reqNorm: string,
  reqTokens: string[],
  candidate: CoachCandidate
): Scored {
  const candNorm = normalize(candidate.name);
  const candFirst = firstToken(candNorm);
  const candLast = lastToken(candNorm);

  // Whole-string similarity is the primary signal for a "First Last" request.
  let score = jaroWinkler(reqNorm, candNorm);

  let surnameHit = false;
  let firstHit = false;

  if (reqTokens.length === 1) {
    // Single-token request: it could be a surname ("Small", "Wilson") OR a bare
    // first name ("Brent", "Coach Todd" once the prefix is stripped upstream).
    // Score it against both the candidate's last and first names and keep the
    // best — a strong surname hit is the more specific, trusted signal.
    const surScore = jaroWinkler(reqNorm, candLast);
    const firScore = jaroWinkler(reqNorm, candFirst);
    surnameHit = surScore >= SURNAME_STRONG;
    firstHit = firScore >= FIRST_NAME_MATCH;
    score = Math.max(score, surScore, firScore);
  } else {
    // Multi-token request ("First Last"): also consider the surname and first
    // name in isolation so a perfect surname match isn't dragged down by a
    // nickname'd first name (e.g. "Mike Wilson" vs "Michael Wilson").
    const reqFirst = firstToken(reqNorm);
    const reqLast = lastToken(reqNorm);
    const surScore = jaroWinkler(reqLast, candLast);
    const firScore = jaroWinkler(reqFirst, candFirst);
    surnameHit = surScore >= SURNAME_STRONG;
    firstHit = firScore >= FIRST_NAME_MATCH;
    // Blend the part scores so both name halves matter, but never below the
    // whole-string score (which already rewards a clean full match).
    score = Math.max(score, (surScore + firScore) / 2);
  }

  return { candidate, score, surname: candLast, surnameHit, firstHit };
}

/**
 * Match ONE cleaned coach request to the best candidate in a division.
 *
 * The request is expected to be roughly "First Last" (or a single token — a
 * bare surname or first name). Returns null when nothing clears `threshold`
 * (default 0.84), i.e. the parent named a coach who isn't on the list.
 *
 * SHARED-SURNAME GUARD: divisions routinely carry two coaches with the same
 * surname (e.g. "Teton Wilson" and "Kyle Wilson"). When the request can't tell
 * them apart — a bare surname, or a first+last whose first name doesn't clearly
 * favor one of them — we still return the best candidate but set
 * `ambiguous: true` so the caller can route it to human review. When the first
 * name DOES single one out, we resolve to that coach with `ambiguous: false`.
 *
 * Worked examples (candidates abbreviated as {first last}):
 *  - "Connor Small" vs [{Connor Small},{Aaron Davis}]      -> Small, ~1.0, not ambiguous
 *  - "Conor Smalls" vs [{Connor Small},...]                -> Small (typo absorbed by JW), not ambiguous
 *  - "Small" vs [{Connor Small},{Logan Myers}]             -> Small via surname hit, not ambiguous
 *  - "Coach Brent" (prefix stripped -> "Brent") vs [{Brent Clissold},{Aaron Davis}]
 *                                                          -> Clissold via first-name hit, not ambiguous
 *  - "Clissold" vs [{Brent Clissold},{Aaron Davis}]        -> Clissold via surname hit, not ambiguous
 *  - "Wilson" vs [{Teton Wilson},{Kyle Wilson}]            -> best Wilson, AMBIGUOUS (two share surname)
 *  - "Kyle Wilson" vs [{Teton Wilson},{Kyle Wilson}]       -> Kyle Wilson, NOT ambiguous (first name decides)
 *  - "T Wilson" vs [{Teton Wilson},{Kyle Wilson}]          -> best Wilson, AMBIGUOUS (initial doesn't decide)
 *  - "Aaron Daviss" vs [{Aaron Davis},{Logan Myers}]       -> Davis, not ambiguous
 *  - "Zzzzz" vs [{Connor Small},{Aaron Davis}]             -> null (nothing clears threshold)
 */
export function matchCoach(
  request: string,
  candidates: CoachCandidate[],
  threshold: number = DEFAULT_THRESHOLD
): CoachMatch {
  const reqNormRaw = normalize(request ?? "");
  if (!reqNormRaw || candidates.length === 0) return null;
  // Strip a leading honorific ("Coach"/"Coaches") so "Coach Clissold" still
  // matches on the surname even when upstream extraction didn't remove it.
  const reqNorm = reqNormRaw.replace(/^(?:coach(?:es)?\s+)+/, "").trim() || reqNormRaw;
  const reqTokens = tokens(reqNorm);

  const scored = candidates.map((c) => scoreCandidate(reqNorm, reqTokens, c));

  // Pick the best-scoring candidate (stable: ties keep input order).
  let best = scored[0];
  for (const s of scored) if (s.score > best.score) best = s;

  if (best.score < threshold) return null;

  // Shared-surname guard. A request "disambiguates" only when it carries a first
  // name that strongly matches exactly one of the surname-sharing candidates.
  const sameSurname = scored.filter(
    (s) => s.surname && s.surname === best.surname && s.score >= threshold
  );
  let ambiguous = false;
  if (sameSurname.length >= 2) {
    const firstNameDecided =
      reqTokens.length > 1 &&
      best.firstHit &&
      sameSurname.filter((s) => s.firstHit).length === 1;
    ambiguous = !firstNameDecided;
  }

  return { coachId: best.candidate.id, score: best.score, ambiguous };
}

/**
 * Try an ordered list of requested coach options (a parent may give
 * alternatives, e.g. ["Brent Clissold","Kevin Green"]) and return the FIRST one
 * that resolves against the candidate list. Honors the parent's stated
 * preference order. Returns null if none of the options clear `threshold`.
 *
 * Note: an ambiguous-but-clearing earlier option short-circuits later options —
 * the parent did name that coach first, and a human-review flag is the right
 * outcome rather than silently skipping to a less-preferred alternative.
 */
export function matchCoachOptions(
  requests: string[],
  candidates: CoachCandidate[],
  threshold: number = DEFAULT_THRESHOLD
): CoachMatch {
  for (const request of requests) {
    const match = matchCoach(request, candidates, threshold);
    if (match) return match;
  }
  return null;
}
