// "Reference" fields: extra kid data a question can display beside its answer so
// the coach sees it all in one place (e.g. shirt size next to the jersey-number
// question). A ref is either a player-profile key below, or another question in
// the same list, encoded as "q:<questionId>".

export type ProfileRefKey = "shirt_size" | "grade" | "age";

export const PROFILE_REF_FIELDS: { key: ProfileRefKey; label: string }[] = [
  { key: "shirt_size", label: "Shirt size" },
  { key: "grade", label: "Grade" },
  { key: "age", label: "Age" },
];

const PROFILE_KEYS = new Set<string>(PROFILE_REF_FIELDS.map((f) => f.key));

export function isQuestionRef(ref: string): boolean {
  return ref.startsWith("q:");
}

export function questionRefId(ref: string): string {
  return ref.slice(2);
}

// Accepts a known profile key or a non-empty question ref.
export function isValidRef(ref: string): boolean {
  return isQuestionRef(ref) ? ref.length > 2 : PROFILE_KEYS.has(ref);
}

// Whole-years age from a "YYYY-MM-DD" date of birth.
export function ageFromDob(dob: string): number | null {
  const [y, m, d] = dob.split("-").map(Number);
  if (!y || !m || !d) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  const monthDiff = today.getMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) age--;
  return age;
}
