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
  invited: ParentEvent[];
};

// Returns the published events the logged-in parent has RSVP'd to, and the
// published events they were invited to but have NOT yet responded to.
// Authorizes the caller via their session -> parent_auth before using the
// service-role client (event_signups / event_invites aren't readable by parents
// under RLS).
export async function getParentEvents(): Promise<ParentEventsResult> {
  const empty: ParentEventsResult = { rsvped: [], invited: [] };

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

  const [{ data: signupRows }, { data: inviteRows }] = await Promise.all([
    service
      .from("event_signups")
      .select("event_id, events!inner(id, slug, title, starts_at, location, status)")
      .eq("parent_id", parentId)
      .eq("events.status", "published"),
    service
      .from("event_invites")
      .select("event_id, events!inner(id, slug, title, starts_at, location, status)")
      .eq("parent_id", parentId)
      .eq("events.status", "published"),
  ]);

  type Row = {
    event_id: string;
    events: ParentEvent | ParentEvent[] | null;
  };

  function unwrap(rows: Row[] | null): Map<string, ParentEvent> {
    const map = new Map<string, ParentEvent>();
    for (const r of rows ?? []) {
      const ev = Array.isArray(r.events) ? r.events[0] : r.events;
      if (ev) map.set(ev.id, ev);
    }
    return map;
  }

  const rsvpedMap = unwrap(signupRows as Row[] | null);
  const invitedMap = unwrap(inviteRows as Row[] | null);

  // Signed up wins: drop any invite that the parent has already responded to.
  for (const id of rsvpedMap.keys()) invitedMap.delete(id);

  const byStart = (a: ParentEvent, b: ParentEvent) =>
    a.starts_at.localeCompare(b.starts_at);

  return {
    rsvped: [...rsvpedMap.values()].sort(byStart),
    invited: [...invitedMap.values()].sort(byStart),
  };
}
