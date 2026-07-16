// The authoritative pricing/snapshot engine for an event signup. Given the
// event's tiers and a list of attendee inputs (attributes keyed by FIELD ID),
// it produces the stored attendee snapshot (attributes re-keyed by LABEL so the
// data is self-describing), the total, and the sibling drafts to remember.
//
// Shared by the public signup (`submitSignup`) and the coach-side editor so both
// price identically. Prices always come from these authoritative tiers — never
// from anything the client claims.
import type { AttendeeStatus, SavedSibling, SignupAttendee } from "@/lib/types";

export type PricingTierField = {
  id: string;
  label: string;
  field_type: string;
  price_adjust_cents: number;
  options: string[];
  option_prices: number[];
};

export type PricingTier = {
  id: string;
  label: string;
  amount_cents: number;
  is_player: boolean;
  is_sibling: boolean;
  event_tier_fields: PricingTierField[];
};

export type PricedAttendeeInput = {
  tier_id: string;
  name: string | null;
  attributes: Record<string, string | number | boolean>; // keyed by field id
  status?: AttendeeStatus;
};

export function buildPricedAttendees(
  tiers: PricingTier[],
  inputs: PricedAttendeeInput[],
  isDecline: boolean,
): {
  attendees: SignupAttendee[];
  total_cents: number;
  attendingUnits: number;
  siblingDrafts: SavedSibling[];
} {
  const tierById = new Map(tiers.map((t) => [t.id, t]));
  const attendees: SignupAttendee[] = [];
  const siblingDrafts: SavedSibling[] = [];
  let total_cents = 0;
  let attendingUnits = 0;

  // A decline carries no attendees; otherwise build the priced snapshot. Each
  // input attendee = one paid unit; cap defensively.
  for (const a of (isDecline ? [] : inputs).slice(0, 200)) {
    const t = tierById.get(a.tier_id);
    if (!t) continue;
    // Remap attribute keys from field id → label so stored data is self-describing.
    const fieldLabel = new Map((t.event_tier_fields ?? []).map((f) => [f.id, f.label]));
    const labeled: Record<string, string | number | boolean> = {};
    for (const [fid, v] of Object.entries(a.attributes ?? {})) {
      if (v === "" || v === null || v === undefined) continue;
      labeled[fieldLabel.get(fid) ?? fid] = v;
    }
    const trimmedName = a.name?.trim() || null;
    const status: AttendeeStatus = a.status === "declined" ? "declined" : "attending";
    // Per-attendee price = tier base + adjustments for any Yes/No or checkbox
    // field answered yes/checked, or a priced select option (clamped at $0).
    let adjust = 0;
    for (const f of t.event_tier_fields ?? []) {
      if ((f.field_type === "yesno" || f.field_type === "checkbox") && a.attributes?.[f.id] === true) {
        adjust += f.price_adjust_cents ?? 0;
      } else if (f.field_type === "select" && (f.option_prices?.length ?? 0) > 0) {
        const idx = (f.options ?? []).indexOf(a.attributes?.[f.id] as string);
        if (idx >= 0) adjust += f.option_prices[idx] ?? 0;
      }
    }
    const unitAmount = Math.max(0, t.amount_cents + adjust);
    attendees.push({
      tier_id: t.id,
      tier_label: t.label,
      amount_cents: unitAmount,
      is_player: t.is_player,
      name: trimmedName,
      attributes: labeled,
      status,
    });
    // Declined attendees are recorded (so the coach sees who's out) but never charged.
    if (status === "attending") {
      total_cents += unitAmount;
      attendingUnits++;
    }
    if (t.is_sibling && trimmedName) siblingDrafts.push({ name: trimmedName, attributes: labeled });
  }

  return { attendees, total_cents, attendingUnits, siblingDrafts };
}
