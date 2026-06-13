"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { buildEmailHtml, btn, esc, infoRow, infoTable } from "@/lib/email-template";
import { renderMarkdown } from "@/lib/markdown";
import type { EventFieldType, EventStatus } from "@/lib/types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Coach = authenticated user with no parent_auth row. Every action re-checks
// this server-side since actions are reachable via direct POST.
async function requireCoach(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: parentLink } = await supabase
    .from("parent_auth")
    .select("parent_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (parentLink) return null; // parents are not coaches
  return user.id;
}

function makeSlug(title: string): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "event";
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 6);
  return `${base}-${rand}`;
}

export type EventFieldInput = {
  id?: string;
  label: string;
  field_type: EventFieldType;
  options: string[];
  required: boolean;
};

export type EventTierFieldInput = {
  id?: string;
  label: string;
  field_type: EventFieldType;
  options: string[];
  required: boolean;
};

export type EventTierInput = {
  id?: string;
  label: string;
  amount_cents: number;
  is_player: boolean;
  collect_attendees: boolean;
  player_attributes: string[];
  is_sibling: boolean;
  fields: EventTierFieldInput[];
};

export type EventPayload = {
  id?: string;
  team_id: string | null;
  title: string;
  description: string;
  location: string;
  starts_at: string | null;
  ends_at: string | null;
  signup_deadline: string | null;
  pay_url: string;
  pay_instructions: string;
  image_urls: string[];
  fields: EventFieldInput[];
  tiers: EventTierInput[];
};

export type SaveEventResult = { error?: string; id?: string; slug?: string };

export async function saveEvent(payload: EventPayload): Promise<SaveEventResult> {
  const supabase = await createClient();
  if (!(await requireCoach(supabase))) return { error: "Not authorized" };

  const title = payload.title.trim();
  if (!title) return { error: "Title is required" };

  const eventRow = {
    team_id: payload.team_id,
    title,
    description: payload.description.trim() || null,
    location: payload.location.trim() || null,
    starts_at: payload.starts_at || null,
    ends_at: payload.ends_at || null,
    signup_deadline: payload.signup_deadline || null,
    pay_url: payload.pay_url.trim() || null,
    pay_instructions: payload.pay_instructions.trim() || null,
    image_urls: payload.image_urls,
  };

  let eventId = payload.id;

  if (eventId) {
    const { error } = await supabase.from("events").update(eventRow).eq("id", eventId);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await supabase
      .from("events")
      .insert({ ...eventRow, slug: makeSlug(title), status: "draft" })
      .select("id")
      .single();
    if (error) return { error: error.message };
    eventId = data.id;
  }

  const fieldsResult = await syncChildren(
    supabase,
    "event_fields",
    "event_id",
    eventId!,
    payload.fields.map((f, i) => ({
      id: f.id,
      row: {
        event_id: eventId,
        label: f.label.trim(),
        field_type: f.field_type,
        options: f.options,
        required: f.required,
        position: i,
      },
    }))
  );
  if ("error" in fieldsResult) return { error: fieldsResult.error };

  const tiersResult = await syncChildren(
    supabase,
    "event_price_tiers",
    "event_id",
    eventId!,
    payload.tiers.map((t, i) => ({
      id: t.id,
      row: {
        event_id: eventId,
        label: t.label.trim(),
        amount_cents: Math.max(0, Math.round(t.amount_cents)),
        position: i,
        is_player: t.is_player,
        collect_attendees: t.collect_attendees,
        player_attributes: t.collect_attendees ? t.player_attributes : [],
        is_sibling: t.is_sibling,
      },
    }))
  );
  if ("error" in tiersResult) return { error: tiersResult.error };

  // Sync each tier's attendee fields now that we know the (possibly new) ids.
  for (let i = 0; i < payload.tiers.length; i++) {
    const tierId = tiersResult.ids[i];
    const tier = payload.tiers[i];
    const res = await syncChildren(
      supabase,
      "event_tier_fields",
      "tier_id",
      tierId,
      (tier.collect_attendees ? tier.fields : []).map((f, j) => ({
        id: f.id,
        row: {
          tier_id: tierId,
          label: f.label.trim(),
          field_type: f.field_type,
          options: f.field_type === "select" ? f.options : [],
          required: f.required,
          position: j,
        },
      }))
    );
    if ("error" in res) return { error: res.error };
  }

  // Fetch slug for the caller (so a freshly-created event can link out).
  const { data: ev } = await supabase.from("events").select("slug").eq("id", eventId!).single();

  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
  return { id: eventId, slug: ev?.slug };
}

// Diff-sync child rows by id: update existing, insert new, delete removed.
// Returns the resulting row ids in payload order (callers use them to sync
// grandchildren, e.g. a tier's attendee fields). Preserving ids matters because
// signup data is keyed by field/tier id.
async function syncChildren(
  supabase: SupabaseClient,
  table: "event_fields" | "event_price_tiers" | "event_tier_fields",
  parentCol: "event_id" | "tier_id",
  parentId: string,
  items: { id?: string; row: Record<string, unknown> }[]
): Promise<{ ids: string[] } | { error: string }> {
  const { data: existing } = await supabase.from(table).select("id").eq(parentCol, parentId);
  const existingIds = new Set((existing ?? []).map((r) => r.id as string));
  const keptIds = new Set<string>();
  const ids: string[] = [];

  for (const item of items) {
    if (item.id && existingIds.has(item.id)) {
      keptIds.add(item.id);
      const { error } = await supabase.from(table).update(item.row).eq("id", item.id);
      if (error) return { error: error.message };
      ids.push(item.id);
    } else {
      const { data, error } = await supabase.from(table).insert(item.row).select("id").single();
      if (error) return { error: error.message };
      ids.push(data.id as string);
    }
  }

  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
  if (toDelete.length) {
    const { error } = await supabase.from(table).delete().in("id", toDelete);
    if (error) return { error: error.message };
  }
  return { ids };
}

export async function setEventStatus(
  eventId: string,
  status: EventStatus
): Promise<{ error?: string }> {
  const supabase = await createClient();
  if (!(await requireCoach(supabase))) return { error: "Not authorized" };
  const { error } = await supabase.from("events").update({ status }).eq("id", eventId);
  if (error) return { error: error.message };
  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
  return {};
}

export async function togglePaid(
  signupId: string,
  paid: boolean
): Promise<{ error?: string }> {
  const supabase = await createClient();
  if (!(await requireCoach(supabase))) return { error: "Not authorized" };
  const { error } = await supabase
    .from("event_signups")
    .update({ paid, paid_at: paid ? new Date().toISOString() : null })
    .eq("id", signupId);
  if (error) return { error: error.message };
  revalidatePath("/events");
  return {};
}

export async function updateSignupNotes(
  signupId: string,
  notes: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  if (!(await requireCoach(supabase))) return { error: "Not authorized" };
  const { error } = await supabase
    .from("event_signups")
    .update({ coach_notes: notes.trim() || null })
    .eq("id", signupId);
  if (error) return { error: error.message };
  return {};
}

export async function deleteEvent(eventId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  if (!(await requireCoach(supabase))) return { error: "Not authorized" };
  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) return { error: error.message };
  revalidatePath("/events");
  return {};
}

// ── Invites (tracked) ────────────────────────────────────────────────────────

type InviteParent = { id: string; first_name: string; last_name: string; email: string | null };

// Invite a hand-picked set of parents (the per-player picker on the event
// page). Records the invite (so it shows on each parent's dashboard) and emails
// the signup link to those with an address. Generalizes sendEventInvites, which
// blasts the whole team.
export type InviteParentsResult = { sent: number; failed: number; invited: number; error?: string };

export async function inviteParents(
  eventId: string,
  parentIds: string[]
): Promise<InviteParentsResult> {
  const supabase = await createClient();
  if (!(await requireCoach(supabase))) return { sent: 0, failed: 0, invited: 0, error: "Not authorized" };

  const ids = [...new Set(parentIds)].filter(Boolean);
  if (ids.length === 0) return { sent: 0, failed: 0, invited: 0, error: "Pick at least one player to invite." };

  const { data: event } = await supabase
    .from("events")
    .select("id, title, slug, status, team_id, starts_at, location, description")
    .eq("id", eventId)
    .single();
  if (!event) return { sent: 0, failed: 0, invited: 0, error: "Event not found." };
  if (event.status !== "published")
    return { sent: 0, failed: 0, invited: 0, error: "Publish the event before inviting." };

  const service = createServiceClient();

  let teamName: string | null = null;
  if (event.team_id) {
    const { data: team } = await service.from("teams").select("name").eq("id", event.team_id).maybeSingle();
    teamName = team?.name ?? null;
  }

  const { data: parentRows } = await service
    .from("parents")
    .select("id, first_name, last_name, email")
    .in("id", ids);
  const parents = (parentRows ?? []) as InviteParent[];

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const url = `${proto}://${h.get("host")}/event/${event.slug}`;
  const dateStr = event.starts_at
    ? new Date(event.starts_at).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })
    : null;

  let sent = 0;
  let failed = 0;
  let invited = 0;
  for (const p of parents) {
    // Record the invite first — it's what surfaces on the parent's dashboard,
    // and must happen whether or not we have an email for them.
    const { error: invErr } = await service.from("event_invites").upsert(
      {
        event_id: eventId,
        parent_id: p.id,
        name: `${p.first_name} ${p.last_name}`.trim(),
        email: p.email,
        sent_at: new Date().toISOString(),
      },
      { onConflict: "event_id,parent_id" }
    );
    if (!invErr) invited++;

    if (p.email) {
      try {
        await sendInviteEmail(p, event.title, teamName, url, dateStr, event.location, event.description);
        sent++;
      } catch {
        failed++;
      }
    }
  }

  revalidatePath(`/events/${eventId}`);
  return { sent, failed, invited };
}

async function sendInviteEmail(
  parent: InviteParent,
  title: string,
  teamName: string | null,
  url: string,
  dateStr: string | null,
  location: string | null,
  description: string | null
): Promise<void> {
  // Prefer the full (markdown) description; fall back to a When/Where summary.
  const rows =
    (dateStr ? infoRow("When", dateStr) : "") + (location ? infoRow("Where", location) : "");
  const details = description?.trim()
    ? renderMarkdown(description, { inline: true })
    : rows
      ? infoTable(rows)
      : "";

  const html = buildEmailHtml({
    teamName: teamName ?? undefined,
    htmlBody:
      `<p style="margin:0 0 14px;font-size:15px;color:#111827;">Hi ${esc(parent.first_name)},</p>` +
      `<p style="margin:0 0 12px;font-size:15px;color:#111827;">You're invited to <strong>${esc(title)}</strong>.</p>` +
      details +
      `<div style="margin:18px 0;">${btn("RSVP / Sign up", url)}</div>` +
      `<p style="margin:0;font-size:13px;color:#6b7280;">Or open this link: <a href="${url}" style="color:#2563eb;">${esc(url)}</a></p>`,
  });
  const text =
    `Hi ${parent.first_name}, you're invited to ${title}.\n\n` +
    (description?.trim() ? `${description.trim()}\n\n` : "") +
    `RSVP / sign up: ${url}`;

  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = `${process.env.EMAIL_FROM_NAME ?? "CS Sports"} <${process.env.EMAIL_FROM ?? "onboarding@resend.dev"}>`;
  const { error } = await resend.emails.send({
    from,
    to: parent.email!,
    subject: `You're invited: ${title}`,
    html,
    text,
  });
  if (error) throw new Error(error.message);
}
