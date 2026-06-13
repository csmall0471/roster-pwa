"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";

export type ParentEvent = {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  location: string | null;
  status: string;
};

export type ParentEventsResult = {
  rsvped: ParentEvent[];
  declined: ParentEvent[];
  invited: ParentEvent[];
};

// Returns, for the logged-in parent's published events: the ones they RSVP'd
// "going" to, the ones they declined, and the ones they were invited to but
// have NOT yet responded to. Authorizes the caller via their session ->
// parent_auth before using the service-role client (event_signups /
// event_invites aren't readable by parents under RLS).
export async function getParentEvents(): Promise<ParentEventsResult> {
  const empty: ParentEventsResult = { rsvped: [], declined: [], invited: [] };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty;

  const { data: parentLink } = await supabase
    .from("parent_auth")
    .select("parent_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!parentLink) return empty;
  const parentId = parentLink.parent_id;

  const service = createServiceClient();

  // A signup made by EITHER parent of the family counts for this parent, so a
  // co-parent's RSVP resolves the invite for both. Invites stay per-parent.
  const { data: mine } = await service
    .from("player_parents")
    .select("player_id")
    .eq("parent_id", parentId);
  const playerIds = [...new Set((mine ?? []).map((r) => r.player_id as string))];
  let familyIds = [parentId];
  if (playerIds.length) {
    const { data: co } = await service
      .from("player_parents")
      .select("parent_id")
      .in("player_id", playerIds);
    familyIds = [...new Set([parentId, ...((co ?? []).map((r) => r.parent_id as string))])];
  }

  const [{ data: signupRows }, { data: inviteRows }] = await Promise.all([
    service
      .from("event_signups")
      .select("event_id, declined, events!inner(id, slug, title, starts_at, location, status)")
      .in("parent_id", familyIds)
      .eq("events.status", "published"),
    service
      .from("event_invites")
      .select("event_id, events!inner(id, slug, title, starts_at, location, status)")
      .eq("parent_id", parentId)
      .eq("events.status", "published"),
  ]);

  type Row = {
    event_id: string;
    declined?: boolean;
    events: ParentEvent | ParentEvent[] | null;
  };

  const evOf = (r: Row): ParentEvent | null =>
    Array.isArray(r.events) ? r.events[0] ?? null : r.events;

  // Split signups into going vs declined.
  const rsvpedMap = new Map<string, ParentEvent>();
  const declinedMap = new Map<string, ParentEvent>();
  for (const r of (signupRows ?? []) as Row[]) {
    const ev = evOf(r);
    if (!ev) continue;
    (r.declined ? declinedMap : rsvpedMap).set(ev.id, ev);
  }

  const invitedMap = new Map<string, ParentEvent>();
  for (const r of (inviteRows ?? []) as Row[]) {
    const ev = evOf(r);
    if (ev) invitedMap.set(ev.id, ev);
  }

  // Any response (going OR declined) resolves the invite — drop it from pending.
  for (const id of rsvpedMap.keys()) invitedMap.delete(id);
  for (const id of declinedMap.keys()) invitedMap.delete(id);

  const byStart = (a: ParentEvent, b: ParentEvent) =>
    a.starts_at.localeCompare(b.starts_at);

  return {
    rsvped: [...rsvpedMap.values()].sort(byStart),
    declined: [...declinedMap.values()].sort(byStart),
    invited: [...invitedMap.values()].sort(byStart),
  };
}
