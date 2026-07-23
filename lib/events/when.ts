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
