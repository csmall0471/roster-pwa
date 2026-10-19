"use server";

import { headers } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { venmoPayLink, eventPayNote } from "@/lib/event-pay";
import { sendSignupConfirmation } from "@/lib/events/signup-confirmation";
import { buildPricedAttendees, type PricingTier } from "@/lib/events/signup-pricing";
import { fieldVisible } from "@/lib/events/field-visibility";
import type { AttendeeStatus, SavedSibling } from "@/lib/types";

import { buildIdentifiedParent, familyParentIds, type IdentifiedParent } from "./identify";
export type { ExistingSignup, IdentifiedParent } from "./identify";

// Called right after the visitor verifies their phone via OTP. Resolves their
// parent record + kids. Authorization: we only ever look up the phone/email of
// the *currently authenticated* session, so a caller can only fetch their own
// data. Service-role reads bypass the inconsistent phone-format RLS matching.
export async function identifyParent(
  eventId?: string
): Promise<IdentifiedParent | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Match a parent the same way the app's protected layout does.
  let parentId: string | null = null;
  if (user.phone) {
    const { data } = await supabase.rpc("match_parent_by_phone", {
      input_phone: user.phone,
    });
    parentId = (data as string | null) ?? null;
  }

  const service = createServiceClient();

  if (!parentId && user.email) {
    const { data } = await service
      .from("parents")
      .select("id")
      .eq("email", user.email)
      .maybeSingle();
    parentId = data?.id ?? null;
  }

  if (!parentId) return null;

  // Link the auth account to the parent for future visits (best-effort).
  await service
    .from("parent_auth")
    .upsert({ auth_user_id: user.id, parent_id: parentId }, { onConflict: "auth_user_id" });

  return buildIdentifiedParent(service, parentId, eventId);
}

// Log a single open of the event link. parent_id is filled when the visitor is
// a signed-in parent; otherwise we dedupe loosely by the anonymous visitorKey.
export async function logEventView(
  eventId: string,
  visitorKey: string | null
): Promise<void> {
  const supabase = await createClient();

  // Resolve a parent_id if this visitor happens to be a logged-in parent.
  let parentId: string | null = null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: link } = await supabase
      .from("parent_auth")
      .select("parent_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    parentId = link?.parent_id ?? null;
  }

  await supabase.from("event_views").insert({
    event_id: eventId,
    parent_id: parentId,
    visitor_key: visitorKey,
  });

  if (parentId) {
    await logActivity(parentId, "event_link_opened", { event_id: eventId });
  }
}

export type SubmitAttendeeInput = {
  tier_id: string;
  name: string | null;
  // Links a roster kid. Server-verified against the family — never trusted.
  player_id?: string | null;
  attributes: Record<string, string | number | boolean>;
  status?: AttendeeStatus;
};

export type SubmitSignupInput = {
  event_id: string;
  parent_id: string | null;
  name: string;
  email: string;
  phone: string;
  responses: Record<string, string | number | boolean>;
  attendees: SubmitAttendeeInput[];
  // "Who should they sit by" seating picks, one entry per roster kid. Sent only
  // when the event collects them (absent = leave any stored picks untouched).
  sit_by?: { player_id: string; picked: string[] }[];
  // "Can't make it": record a decline (no attendees, $0) and skip the form's
  // required-field validation — declining shouldn't force you to fill the form.
  decline?: boolean;
};

export type SubmitSignupResult =
  | { error: string }
  | {
      ok: true;
      declined: boolean;
      total_cents: number;
      pay_url: string | null;
      pay_instructions: string | null;
    };

export async function submitSignup(input: SubmitSignupInput): Promise<SubmitSignupResult> {
  const supabase = await createClient();

  // Load the event + its fields/tiers fresh. This is the authoritative source
  // for prices and required-field validation — never trust the client's amounts.
  const { data: event } = await supabase
    .from("events")
    .select(
      "id, title, slug, team_id, status, starts_at, ends_at, location, description, image_urls, pay_url, pay_instructions, event_fields(*), event_price_tiers(*, event_tier_fields(*))"
    )
    .eq("id", input.event_id)
    .single();

  if (!event) return { error: "Event not found." };
  if (event.status !== "published") return { error: "This event is not accepting signups." };

  const name = input.name.trim();
  if (!name) return { error: "Please enter your name." };

  const isDecline = input.decline === true;

  // Validate required custom fields — but a decline skips the form entirely,
  // and a dependent field only counts while its parent's answer reveals it.
  if (!isDecline) {
    const fieldsById = new Map((event.event_fields ?? []).map((f) => [f.id as string, f]));
    for (const f of event.event_fields ?? []) {
      if (!f.required) continue;
      if (!fieldVisible(f, input.responses, fieldsById)) continue;
      const v = input.responses[f.id];
      const empty = v === undefined || v === null || v === "" || v === false;
      if (empty) return { error: `"${f.label}" is required.` };
    }
  }

  // SECURITY: an attendee's player_id may only point at one of this family's own
  // kids — null out anything else so a forged payload can't tag someone else's
  // player. Guests (no parent_id) never carry player links. The family ids are
  // also reused below for the edit-in-place match and the sit-by picks.
  let familyIds: string[] = [];
  const familyKidIds = new Set<string>();
  if (input.parent_id) {
    const service = createServiceClient();
    familyIds = await familyParentIds(service, input.parent_id);
    const { data: kidRows } = await service
      .from("player_parents")
      .select("player_id")
      .in("parent_id", familyIds);
    for (const r of kidRows ?? []) familyKidIds.add(r.player_id as string);
  }
  const safeAttendees = input.attendees.map((a) => ({
    ...a,
    player_id: a.player_id && familyKidIds.has(a.player_id) ? a.player_id : null,
  }));

  // Build the priced attendee snapshot from the server's authoritative tier
  // amounts/labels (never trust the client). Shared with the coach-side editor.
  const { attendees, total_cents, attendingUnits, siblingDrafts } = buildPricedAttendees(
    (event.event_price_tiers ?? []) as unknown as PricingTier[],
    safeAttendees,
    isDecline,
  );

  // The whole RSVP is a decline if they tapped "can't make it" or nobody from
  // the family is attending (every attendee marked not-attending).
  const declined = isDecline || attendingUnits === 0;

  // Prefill the Venmo note (kid names + event) and amount so the coach can match
  // the payment without the parent typing anything.
  const payUrl = declined
    ? null
    : venmoPayLink(event.pay_url, eventPayNote(attendees, name, event.title), total_cents);

  const email = input.email.trim() || null;
  const phone = input.phone.trim() || null;
  const row = {
    event_id: input.event_id,
    parent_id: input.parent_id,
    name,
    email,
    phone,
    responses: isDecline ? {} : input.responses,
    attendees,
    total_cents,
    declined,
  };

  // If this parent already RSVP'd to this event, edit that row in place instead
  // of creating a duplicate. Authorization: we only ever match on the verified
  // parent's own id (resolved from their session by identifyParent), so a parent
  // can only update their own signup. Guests (no parent_id) always insert.
  let existingId: string | null = null;
  if (input.parent_id) {
    const service = createServiceClient();
    // Either parent of the family (resolved above) edits the same row.
    const { data: existing } = await service
      .from("event_signups")
      .select("id")
      .eq("event_id", input.event_id)
      .in("parent_id", familyIds)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    existingId = existing?.id ?? null;
  }

  if (existingId) {
    const service = createServiceClient();
    const { error } = await service.from("event_signups").update(row).eq("id", existingId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("event_signups").insert(row);
    if (error) return { error: error.message };
  }

  // Seating ("sit by") picks ride along with the RSVP but must never break it —
  // the event_sit_by_picks table ships with a later migration and may not exist
  // yet, so failures are logged and swallowed. A decline clears the family's
  // picks; an absent sit_by payload (events without the picker) changes nothing.
  if (input.parent_id && (isDecline || Array.isArray(input.sit_by))) {
    await persistSitByPicks(
      input.event_id,
      event.team_id ?? null,
      input.parent_id,
      familyKidIds,
      isDecline ? [] : (input.sit_by ?? []),
    ).catch((e) => console.error("event sit-by picks not saved:", e));
  }

  // Remember the family's siblings for next time (skip any that are actually
  // roster players, which belong under the Player tier).
  if (input.parent_id && siblingDrafts.length) {
    await persistSiblings(input.parent_id, siblingDrafts).catch(() => {});
  }

  if (input.parent_id) {
    await logActivity(input.parent_id, "event_signup", {
      event_id: input.event_id,
      total_cents,
    });
  }

  // Confirmation email to the parent/guest. Never let an email failure break the
  // signup itself.
  if (email) {
    const h = await headers();
    const proto = h.get("x-forwarded-proto") ?? "https";
    const eventUrl = `${proto}://${h.get("host")}/event/${event.slug}`;
    await sendSignupConfirmation({
      to: email,
      name,
      title: event.title,
      attendees,
      total_cents,
      declined,
      pay_url: payUrl,
      pay_instructions: declined ? null : event.pay_instructions,
      event_url: eventUrl,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      location: event.location,
      description: event.description,
      image_urls: event.image_urls,
    }).catch(() => {});
  }

  return {
    ok: true,
    declined,
    total_cents,
    pay_url: payUrl,
    pay_instructions: declined ? null : event.pay_instructions,
  };
}

// Replace this family's "sit by" seating picks for an event. Picks are only
// written for the family's own kids, may only point at active players on the
// event's team roster(s) — the same pool the page offers — are capped at 3, and
// never the kid themself. Deleting with nothing to re-insert is how a
// deselect-all (or a decline) clears them. Callers treat failures as non-fatal:
// the event_sit_by_picks table ships with a later migration and may not exist.
async function persistSitByPicks(
  eventId: string,
  primaryTeamId: string | null,
  parentId: string,
  familyKidIds: Set<string>,
  entries: { player_id: string; picked: string[] }[],
): Promise<void> {
  if (familyKidIds.size === 0) return;
  const service = createServiceClient();

  const rows: { event_id: string; player_id: string; picked_player_id: string; parent_id: string }[] = [];
  const wanted = entries.filter((e) => familyKidIds.has(e.player_id) && (e.picked?.length ?? 0) > 0);
  if (wanted.length) {
    const { data: teamRows } = await service
      .from("event_teams")
      .select("team_id")
      .eq("event_id", eventId);
    const teamIds = [
      ...new Set([...(teamRows ?? []).map((r) => r.team_id as string), ...(primaryTeamId ? [primaryTeamId] : [])]),
    ];
    const rosterIds = new Set<string>();
    if (teamIds.length) {
      const { data: rosterRows } = await service
        .from("roster")
        .select("player_id, status")
        .in("team_id", teamIds);
      for (const r of (rosterRows ?? []) as { player_id: string; status: string }[]) {
        if (r.status === "active") rosterIds.add(r.player_id);
      }
    }
    for (const e of wanted) {
      const picked = [...new Set(e.picked)]
        .filter((id) => id && id !== e.player_id && rosterIds.has(id))
        .slice(0, 3);
      for (const pid of picked) {
        rows.push({ event_id: eventId, player_id: e.player_id, picked_player_id: pid, parent_id: parentId });
      }
    }
  }

  const del = await service
    .from("event_sit_by_picks")
    .delete()
    .eq("event_id", eventId)
    .in("player_id", [...familyKidIds]);
  if (del.error) throw new Error(del.error.message);
  if (rows.length) {
    const ins = await service.from("event_sit_by_picks").insert(rows);
    if (ins.error) throw new Error(ins.error.message);
  }
}

// Upsert the family's siblings by name (case-insensitive). Siblings whose name
// matches a roster player are skipped — that kid belongs under the Player tier.
async function persistSiblings(parentId: string, drafts: SavedSibling[]): Promise<void> {
  const service = createServiceClient();

  const { data: links } = await service
    .from("player_parents")
    .select("players(first_name, last_name)")
    .eq("parent_id", parentId);
  type NameRow = { players: { first_name: string; last_name: string } | null };
  const playerNames = new Set(
    ((links ?? []) as unknown as NameRow[])
      .map((r) => (r.players ? `${r.players.first_name} ${r.players.last_name}`.trim().toLowerCase() : ""))
      .filter(Boolean)
  );

  const { data: existing } = await service
    .from("siblings")
    .select("id, name")
    .eq("parent_id", parentId);
  const existingByName = new Map(
    ((existing ?? []) as { id: string; name: string }[]).map((s) => [s.name.trim().toLowerCase(), s.id])
  );

  for (const d of drafts) {
    const lname = d.name.trim().toLowerCase();
    if (!lname || playerNames.has(lname)) continue;
    const existingId = existingByName.get(lname);
    if (existingId) {
      await service
        .from("siblings")
        .update({ name: d.name.trim(), attributes: d.attributes, updated_at: new Date().toISOString() })
        .eq("id", existingId);
    } else {
      const { data: inserted } = await service
        .from("siblings")
        .insert({ parent_id: parentId, name: d.name.trim(), attributes: d.attributes })
        .select("id")
        .single();
      if (inserted) existingByName.set(lname, inserted.id);
    }
  }
}
