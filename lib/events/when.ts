// Event times are stored as UTC timestamptz with no per-event zone; format them
// in the coach's local zone so "10:00 AM" doesn't render as the UTC "5:00 PM".
// Single-tenant default (Arizona); override with EVENT_TIMEZONE if needed.
// Shared by the signup confirmation and the 2-day reminder so both read the same.
export function formatEventWhen(startsAt?: string | null, endsAt?: string | null): string {
  if (!startsAt) return "";
  const timeZone = process.env.EVENT_TIMEZONE || "America/Phoenix";
  const start = new Date(startsAt);
  const startStr = start.toLocaleString("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  if (endsAt) {
    const endStr = new Date(endsAt).toLocaleString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
    return `${startStr} – ${endStr}`;
  }
  return startStr;
}

// A natural "how soon" phrase for reminder subject/body ("is tomorrow", "is in
// 3 days", "is today"). Computed on calendar days in the event's zone so an
// evening event two nights out still reads "in 2 days". Falls back to a neutral
// phrase for missing or past dates.
export function relativeEventPhrase(startsAt?: string | null): string {
  if (!startsAt) return "is coming up";
  const timeZone = process.env.EVENT_TIMEZONE || "America/Phoenix";
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const today = Date.parse(`${dayKey(new Date())}T00:00:00Z`);
  const event = Date.parse(`${dayKey(new Date(startsAt))}T00:00:00Z`);
  const days = Math.round((event - today) / 86_400_000);
  if (Number.isNaN(days) || days < 0) return "is coming up";
  if (days === 0) return "is today";
  if (days === 1) return "is tomorrow";
  return `is in ${days} days`;
}
