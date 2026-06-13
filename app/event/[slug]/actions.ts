"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import {
  buildEmailHtml,
  btn,
  esc,
  infoRow,
  infoTable,
} from "@/lib/email-template";
import { renderMarkdown } from "@/lib/markdown";
import type {
  AttendeeStatus,
  SavedSibling,
  SignupAttendee,
  SignupPlayer,
} from "@/lib/types";

// The parent's existing RSVP for the current event, returned so the form can be
// re-populated and edited in place (rather than creating a duplicate).
export type ExistingSignup = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  responses: Record<string, string | number | boolean>;
  attendees: SignupAttendee[];
  declined: boolean;
};

export type IdentifiedParent = {
  parent_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  players: SignupPlayer[];
  siblings: SavedSibling[];
  existing_signup: ExistingSignup | null;
};

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

  const { data: parent } = await service
    .from("parents")
    .select("id, first_name, last_name, email, phone")
    .eq("id", parentId)
    .maybeSingle();
  if (!parent) return null;

  // Link the auth account to the parent for future visits (best-effort).
  await service
    .from("parent_auth")
    .upsert({ auth_user_id: user.id, parent_id: parentId }, { onConflict: "auth_user_id" });

  const { data: links } = await service
    .from("player_parents")
    .select("players(id, first_name, last_name, grade, shirt_size, date_of_birth)")
    .eq("parent_id", parentId);

  // Each player_parents row carries its kid under `players`. PostgREST normally
  // returns this embed as a single object, but depending on how it resolves the
  // relationship it can come back as a one-element array — handle both so every
  // linked kid is collected (previously an array shape silently dropped kids).
  type PlayerRow = {
    id: string;
    first_name: string;
    last_name: string;
    grade: string | null;
    shirt_size: string | null;
    date_of_birth: string | null;
  };
  type LinkRow = { players: PlayerRow | PlayerRow[] | null };
  const players: SignupPlayer[] = [];
  const seenPlayerIds = new Set<string>();
  for (const row of (links ?? []) as unknown as LinkRow[]) {
    const embedded = Array.isArray(row.players) ? row.players : row.players ? [row.players] : [];
    for (const p of embedded) {
      if (!p || seenPlayerIds.has(p.id)) continue;
      seenPlayerIds.add(p.id);
      players.push({
        id: p.id,
        name: `${p.first_name} ${p.last_name}`.trim(),
        grade: p.grade,
        shirt_size: p.shirt_size,
        date_of_birth: p.date_of_birth,
      });
    }
  }

  // Saved siblings, excluding any that are actually roster players (linked or
  // name-matching) so the same kid isn't offered under both tiers.
  const playerNames = new Set(players.map((p) => p.name.toLowerCase()));
  const { data: sibRows } = await service
    .from("siblings")
    .select("name, attributes, player_id")
    .eq("parent_id", parentId);
  const siblings: SavedSibling[] = [];
  for (const s of (sibRows ?? []) as { name: string; attributes: SavedSibling["attributes"]; player_id: string | null }[]) {
    if (s.player_id) continue;
    if (playerNames.has(s.name.trim().toLowerCase())) continue;
    siblings.push({ name: s.name, attributes: s.attributes ?? {} });
  }

  // If this parent already RSVP'd to this event, return that row so the form can
  // be re-populated and edited in place instead of creating a duplicate.
  let existing_signup: ExistingSignup | null = null;
  if (eventId) {
    const { data: row } = await service
      .from("event_signups")
      .select("id, name, email, phone, responses, attendees, declined")
      .eq("event_id", eventId)
      .eq("parent_id", parentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (row) {
      const rawAttendees = (row.attendees ?? []) as SignupAttendee[];
      existing_signup = {
        id: row.id,
        name: row.name ?? "",
        email: row.email ?? null,
        phone: row.phone ?? null,
        responses: (row.responses ?? {}) as Record<string, string | number | boolean>,
        attendees: rawAttendees.map((a) => ({
          ...a,
          status: a.status === "declined" ? "declined" : "attending",
        })),
        declined: Boolean(row.declined),
      };
    }
  }

  return {
    parent_id: parent.id,
    first_name: parent.first_name ?? "",
    last_name: parent.last_name ?? "",
    email: parent.email ?? null,
    phone: parent.phone ?? null,
    players,
    siblings,
    existing_signup,
  };
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
      "id, title, team_id, status, pay_url, pay_instructions, event_fields(*), event_price_tiers(*, event_tier_fields(*))"
    )
    .eq("id", input.event_id)
    .single();

  if (!event) return { error: "Event not found." };
  if (event.status !== "published") return { error: "This event is not accepting signups." };

  const name = input.name.trim();
  if (!name) return { error: "Please enter your name." };

  const isDecline = input.decline === true;

  // Validate required custom fields — but a decline skips the form entirely.
  if (!isDecline) {
    for (const f of event.event_fields ?? []) {
      if (!f.required) continue;
      const v = input.responses[f.id];
      const empty = v === undefined || v === null || v === "" || v === false;
      if (empty) return { error: `"${f.label}" is required.` };
    }
  }

  // Build the priced attendee snapshot from the server's authoritative tier
  // amounts/labels (never trust the client). Each input attendee = one paid unit.
  // Attribute keys are remapped from field id → label so stored data is
  // self-describing for the coach dashboard.
  type TierFieldRow = { id: string; label: string };
  type TierRow = {
    id: string;
    label: string;
    amount_cents: number;
    is_player: boolean;
    is_sibling: boolean;
    event_tier_fields: TierFieldRow[];
  };
  const tiers = (event.event_price_tiers ?? []) as TierRow[];
  const tierById = new Map(tiers.map((t) => [t.id, t]));
  const attendees: SignupAttendee[] = [];
  const siblingDrafts: SavedSibling[] = [];
  let total_cents = 0;
  let attendingUnits = 0;
  // A decline carries no attendees; otherwise build the priced snapshot.
  for (const a of (isDecline ? [] : input.attendees).slice(0, 200)) {
    const t = tierById.get(a.tier_id);
    if (!t) continue;
    const fieldLabel = new Map((t.event_tier_fields ?? []).map((f) => [f.id, f.label]));
    const labeled: Record<string, string | number | boolean> = {};
    for (const [fid, v] of Object.entries(a.attributes ?? {})) {
      if (v === "" || v === null || v === undefined) continue;
      labeled[fieldLabel.get(fid) ?? fid] = v;
    }
    const trimmedName = a.name?.trim() || null;
    const status: AttendeeStatus = a.status === "declined" ? "declined" : "attending";
    attendees.push({
      tier_id: t.id,
      tier_label: t.label,
      amount_cents: t.amount_cents,
      is_player: t.is_player,
      name: trimmedName,
      attributes: labeled,
      status,
    });
    // Declined attendees are recorded (so the coach sees who's out) but never
    // charged.
    if (status === "attending") {
      total_cents += t.amount_cents;
      attendingUnits++;
    }
    if (t.is_sibling && trimmedName) siblingDrafts.push({ name: trimmedName, attributes: labeled });
  }

  // The whole RSVP is a decline if they tapped "can't make it" or nobody from
  // the family is attending (every attendee marked not-attending).
  const declined = isDecline || attendingUnits === 0;

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
    const { data: existing } = await service
      .from("event_signups")
      .select("id")
      .eq("event_id", input.event_id)
      .eq("parent_id", input.parent_id)
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
    let teamName: string | null = null;
    if (event.team_id) {
      const service = createServiceClient();
      const { data: team } = await service
        .from("teams")
        .select("name")
        .eq("id", event.team_id)
        .maybeSingle();
      teamName = team?.name ?? null;
    }
    await sendSignupConfirmation({
      to: email,
      name,
      title: event.title,
      teamName,
      attendees,
      total_cents,
      declined,
      pay_url: declined ? null : event.pay_url,
      pay_instructions: declined ? null : event.pay_instructions,
    }).catch(() => {});
  }

  return {
    ok: true,
    declined,
    total_cents,
    pay_url: declined ? null : event.pay_url,
    pay_instructions: declined ? null : event.pay_instructions,
  };
}

// Sends the RSVP confirmation email. Mirrors the dynamic-import Resend pattern
// used by sendEventInvites. Throws on send error so callers can swallow it.
async function sendSignupConfirmation(args: {
  to: string;
  name: string;
  title: string;
  teamName: string | null;
  attendees: SignupAttendee[];
  total_cents: number;
  declined: boolean;
  pay_url: string | null;
  pay_instructions: string | null;
}): Promise<void> {
  const { to, name, title, teamName, attendees, total_cents, declined, pay_url, pay_instructions } = args;

  // A decline gets a short "thanks for letting us know" note instead of an RSVP
  // receipt — no attendees, no payment.
  if (declined) {
    const html = buildEmailHtml({
      teamName: teamName ?? undefined,
      htmlBody:
        `<p style="margin:0 0 14px;font-size:15px;color:#111827;">Hi ${esc(name)},</p>` +
        `<p style="margin:0 0 12px;font-size:15px;color:#111827;">Thanks for letting us know you can&rsquo;t make <strong>${esc(title)}</strong>. We&rsquo;ve marked you as not attending.</p>` +
        `<p style="margin:0;font-size:13px;color:#6b7280;">Changed your mind? Just re-open the event link to update your RSVP.</p>`,
    });
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = `${process.env.EMAIL_FROM_NAME ?? "CS Sports"} <${process.env.EMAIL_FROM ?? "onboarding@resend.dev"}>`;
    const { error } = await resend.emails.send({
      from,
      to,
      subject: `Got it — you can't make ${title}`,
      html,
      text: `Hi ${name}, thanks for letting us know you can't make ${title}. We've marked you as not attending. Changed your mind? Re-open the event link to update your RSVP.`,
    });
    if (error) throw new Error(error.message);
    return;
  }

  const attending = attendees.filter((a) => (a.status ?? "attending") !== "declined");
  const declinedAttendees = attendees.filter((a) => a.status === "declined");

  const fmtName = (a: SignupAttendee) => a.name?.trim() || a.tier_label;
  const attendingRows = attending
    .map((a) => infoRow(a.tier_label, fmtName(a)))
    .join("");
  const declinedRows = declinedAttendees
    .map((a) => infoRow(`${a.tier_label} (not attending)`, fmtName(a)))
    .join("");

  const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const sections: string[] = [
    `<p style="margin:0 0 14px;font-size:15px;color:#111827;">Hi ${esc(name)},</p>`,
    `<p style="margin:0 0 12px;font-size:15px;color:#111827;">You're signed up for <strong>${esc(title)}</strong>. Here's your RSVP:</p>`,
  ];
  if (attendingRows || declinedRows) sections.push(infoTable(attendingRows + declinedRows));
  if (total_cents > 0)
    sections.push(
      `<p style="margin:0 0 12px;font-size:15px;color:#111827;">Total due: <strong>${money(total_cents)}</strong></p>`
    );
  if (pay_instructions?.trim())
    sections.push(
      `<div style="margin:0 0 12px;font-size:14px;color:#374151;">${renderMarkdown(pay_instructions, { inline: true })}</div>`
    );
  if (pay_url)
    sections.push(
      `<div style="margin:18px 0;">${btn(`Pay now${total_cents > 0 ? ` · ${money(total_cents)}` : ""}`, pay_url, "#16a34a")}</div>`
    );

  const html = buildEmailHtml({
    teamName: teamName ?? undefined,
    htmlBody: sections.join(""),
  });

  const textLines = [
    `Hi ${name}, you're signed up for ${title}.`,
    "",
    ...attending.map((a) => `Attending — ${a.tier_label}: ${fmtName(a)}`),
    ...declinedAttendees.map((a) => `Not attending — ${a.tier_label}: ${fmtName(a)}`),
  ];
  if (total_cents > 0) textLines.push("", `Total due: ${money(total_cents)}`);
  if (pay_url) textLines.push("", `Pay: ${pay_url}`);

  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = `${process.env.EMAIL_FROM_NAME ?? "CS Sports"} <${process.env.EMAIL_FROM ?? "onboarding@resend.dev"}>`;
  const { error } = await resend.emails.send({
    from,
    to,
    subject: `You're signed up: ${title}`,
    html,
    text: textLines.join("\n"),
  });
  if (error) throw new Error(error.message);
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
