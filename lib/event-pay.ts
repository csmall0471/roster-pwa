import type { SignupAttendee } from "@/lib/types";

// Turn a Venmo profile/pay link into a one-tap payment link with the amount and
// a note (kid names + event) prefilled. Non-Venmo links pass through untouched;
// null/blank in → null out. Shared by the signup confirmation and the 2-day
// reminder so both produce the identical "Pay now" link.
export function venmoPayLink(payUrl: string | null, note: string, amountCents: number): string | null {
  if (!payUrl) return null;
  try {
    const u = new URL(payUrl);
    if (!/(^|\.)venmo\.com$/i.test(u.hostname)) return payUrl;
    // Handle = last path segment, ignoring a leading "u" (…/u/Handle).
    const segs = u.pathname.split("/").filter((s) => s && s.toLowerCase() !== "u");
    const handle = segs[segs.length - 1];
    if (!handle) return payUrl;
    // Build the query with percent-encoding (encodeURIComponent → spaces as
    // %20). URLSearchParams uses form-encoding (spaces as "+"), which Venmo's
    // note field renders literally as plus signs.
    const parts = ["txn=pay"];
    if (amountCents > 0) parts.push(`amount=${(amountCents / 100).toFixed(2)}`);
    if (note) parts.push(`note=${encodeURIComponent(note)}`);
    return `https://venmo.com/${handle}?${parts.join("&")}`;
  } catch {
    return payUrl;
  }
}

// The payment note: the attending kids' names (falling back to the signer's
// name) plus the event title — so the coach can match a Venmo payment to a kid.
export function eventPayNote(attendees: SignupAttendee[], signerName: string, eventTitle: string): string {
  const kids = attendees
    .filter((a) => a.is_player && (a.status ?? "attending") !== "declined" && a.name)
    .map((a) => a.name as string);
  return `${kids.length ? kids.join(", ") : signerName} - ${eventTitle}`;
}
