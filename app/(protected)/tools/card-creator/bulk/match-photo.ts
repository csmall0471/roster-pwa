const tokens = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

type Matchable = { key: string; firstName: string; lastName: string };

// Guess whose photo this is from its file name ("Jack_Lambert_2.jpg"). Returns a
// target only when exactly one fits: first the full name, then a last name of at
// least 3 letters with nothing but digits beside it, so "Jack_Lambert.jpg" never
// lands on a different Lambert and "Game_Day_034.jpg" never lands on a Day.
// Camera names like IMG_1234 match nobody.
export function matchPhotoToTarget<T extends Matchable>(fileName: string, targets: T[]): T | null {
  const inName = new Set(tokens(fileName.replace(/\.[^.]+$/, "")));
  const lastTokens = (t: T) => tokens(t.lastName);
  const has = (list: string[]) => list.length > 0 && list.every((w) => inName.has(w));

  const byFullName = targets.filter((t) => has(tokens(t.firstName)) && has(lastTokens(t)));
  if (byFullName.length > 0) return byFullName.length === 1 ? byFullName[0] : null;

  const byLastName = targets.filter((t) => {
    const last = lastTokens(t);
    if (last.join("").length < 3 || !has(last)) return false;
    return [...inName].every((w) => last.includes(w) || /^\d+$/.test(w));
  });
  if (byLastName.length !== 1) return null;
  // "Carter.jpg" could just as well be Carter Davis on the same roster.
  const lastName = lastTokens(byLastName[0]).join(" ");
  const alsoAFirstName = targets.some((t) => tokens(t.firstName).join(" ") === lastName);
  return alsoAFirstName ? null : byLastName[0];
}
