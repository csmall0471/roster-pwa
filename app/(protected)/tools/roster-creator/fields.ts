import { normalize, jaroWinkler } from "./resolve/similarity";

// Canonical fields the Roster Creator understands. The uploaded sheet's
// headers are mapped onto these. Kept deliberately separate from the main
// app's types — this tool is isolated.

export type CanonicalField =
  | "first_name"
  | "last_name"
  | "gender"
  | "age_group"
  | "package_name"
  | "school"
  | "coach_first"
  | "coach_last"
  | "team_name"
  | "buddy_first"
  | "buddy_last"
  | "practice_nights";

export type FieldDef = {
  key: CanonicalField;
  label: string;
  // package_name is the division key we split teams by; names identify players.
  required: boolean;
};

export const FIELD_DEFS: FieldDef[] = [
  { key: "first_name", label: "Player first name", required: true },
  { key: "last_name", label: "Player last name", required: true },
  { key: "gender", label: "Gender", required: false },
  { key: "age_group", label: "Age group", required: false },
  { key: "package_name", label: "Package / division", required: true },
  { key: "school", label: "School", required: false },
  { key: "coach_first", label: "Coach request — first", required: false },
  { key: "coach_last", label: "Coach request — last", required: false },
  { key: "team_name", label: "Team name request", required: false },
  { key: "buddy_first", label: "Buddy/family — first", required: false },
  { key: "buddy_last", label: "Buddy/family — last", required: false },
  { key: "practice_nights", label: "Practice nights", required: false },
];

export const FIELD_LABELS: Record<CanonicalField, string> = Object.fromEntries(
  FIELD_DEFS.map((f) => [f.key, f.label])
) as Record<CanonicalField, string>;

// canonical field -> chosen source header string
export type ColumnMapping = Partial<Record<CanonicalField, string>>;

// Best-effort auto-map of source headers onto canonical fields. Specific
// patterns (coach/team/buddy) are tested before the generic first/last so a
// header like "Coach First Name" doesn't get grabbed as the player's name.
export function autoMapColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const taken = new Set<CanonicalField>();

  const assign = (field: CanonicalField, header: string) => {
    if (!taken.has(field)) {
      mapping[field] = header;
      taken.add(field);
    }
  };

  for (const header of headers) {
    const h = header.toLowerCase();
    const has = (...parts: string[]) => parts.every((p) => h.includes(p));

    if (has("coach") && h.includes("first")) assign("coach_first", header);
    else if (has("coach") && h.includes("last")) assign("coach_last", header);
    else if (h.includes("team name") || (h.includes("team") && !h.includes("teammate")))
      assign("team_name", header);
    else if ((h.includes("teammate") || h.includes("family")) && h.includes("first"))
      assign("buddy_first", header);
    else if ((h.includes("teammate") || h.includes("family")) && h.includes("last"))
      assign("buddy_last", header);
    else if (h.includes("package")) assign("package_name", header);
    else if (h.includes("school")) assign("school", header);
    else if (h.includes("gender")) assign("gender", header);
    else if (h.includes("age")) assign("age_group", header);
    else if (h.includes("night") || h.includes("practice"))
      assign("practice_nights", header);
    else if (h.includes("first")) assign("first_name", header);
    else if (h.includes("last")) assign("last_name", header);
  }

  return mapping;
}

// Values that mean "no request" across the messy free-text fields. Used only
// for display cleanup in the preview; real resolution happens in Phase 2.
const NO_REQUEST = new Set([
  "none", "n/a", "na", "no", "nonr", "nonr.", "no e", "not sure", "n9ne", "nine", "",
]);

export function isNoRequest(value: string | undefined | null): boolean {
  if (value == null) return true;
  return NO_REQUEST.has(value.trim().toLowerCase());
}

// Heuristic: does a raw coach-field value actually look like a coach NAME, vs a
// note that landed in the coach field ("Same practice night as his brother")?
// Used so data-in-the-wrong-field isn't counted/shown as a coach request.
const NOT_A_COACH =
  /\b(night|practice|same|brother|sister|cousin|sibling|twin|available|prefer|play\s*up|playup|whoever|anyone|last\s*season|monday|tuesday|wednesday|thursday|friday|saturday|sunday|idk|tbd)\b/i;
export function looksLikeCoachName(value: string | undefined | null): boolean {
  const v = (value ?? "").trim();
  if (!v || isNoRequest(v)) return false;
  if (NOT_A_COACH.test(v)) return false;
  // Names are short — a long phrase is a sentence, not a coach.
  return v.split(/\s+/).filter(Boolean).length <= 4;
}

export type RowData = Record<string, string>;

// Pull a canonical field's value out of a raw row via the mapping.
export function fieldValue(
  row: RowData,
  mapping: ColumnMapping,
  field: CanonicalField
): string {
  const header = mapping[field];
  if (!header) return "";
  return (row[header] ?? "").toString().trim();
}

export type CanonicalRecord = Record<CanonicalField, string>;

// Materialize all canonical fields from a raw row via the mapping.
export function canonicalRecord(row: RowData, mapping: ColumnMapping): CanonicalRecord {
  const out = {} as CanonicalRecord;
  for (const f of FIELD_DEFS) out[f.key] = fieldValue(row, mapping, f.key);
  return out;
}

// Fallback bucket name when a row has no package_name value.
export const NO_PACKAGE = "(no division)";

export function packageOf(record: CanonicalRecord): string {
  return record.package_name || NO_PACKAGE;
}

// Is this player the requested coach's own child? Two signals:
//  1. the registering account IS essentially the coach (parent registered &
//     listed themselves) — full-name match; or
//  2. the family surname matches the coach's surname AND they asked for that
//     coach — covers "mom (Tracey Myers) registers, dad (Logan Myers) coaches".
// Requires they actually requested the coach, so a shared common surname alone
// isn't enough.
export function isCoachChild(playerLastName: string, accountName: string, coachName: string): boolean {
  const coach = coachNorm(coachName);
  if (!coach) return false;
  // The parent IS this coach — match the FULL name, but guard against a shared
  // FIRST name alone (parent "Brandon Nicastro" vs coach "Brandon Ryan" scores
  // 0.90 overall) by also requiring the surnames to be similar.
  if (
    accountName &&
    jaroWinkler(coachNorm(accountName), coach) >= 0.9 &&
    jaroWinkler(lastToken(coachNorm(accountName)), lastToken(coach)) >= 0.7
  )
    return true;
  const cl = lastToken(coach);
  if (cl.length < 3) return false; // too-short surnames invite false matches
  return lastToken(coachNorm(accountName)) === cl || lastToken(coachNorm(playerLastName)) === cl;
}
const coachNorm = (s: string) => normalize(s ?? "");
const lastToken = (s: string) => {
  const t = s.split(" ").filter(Boolean);
  return t[t.length - 1] ?? "";
};

// Pull the registering parent/account name out of a player's stored raw row.
// `raw` keeps the original CSV under its own header strings (account isn't a
// materialized column), so match the header flexibly across export formats.
// Used to detect a coach's own child (account name ≈ requested coach).
export function accountNameOf(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const row = raw as Record<string, unknown>;
  const keys = Object.keys(row);
  const find = (re: RegExp) => {
    const k = keys.find((key) => re.test(key));
    return k ? String(row[k] ?? "").trim() : "";
  };
  const first = find(/(account|parent|guardian).*first/i);
  const last = find(/(account|parent|guardian).*last/i);
  return `${first} ${last}`.trim();
}
