import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { renderMarkdown, markdownClass } from "@/lib/markdown";
import type { EventSignup, EventWithDetails } from "@/lib/types";
import EventManageControls from "../_components/EventManageControls";
import EventInviteButton from "../_components/EventInviteButton";
import EventEmailInvite from "../_components/EventEmailInvite";
import InvitesPanel from "../_components/InvitesPanel";
import SignupsDashboard from "../_components/SignupsDashboard";

type Recipient = { name: string; email: string | null; phone: string | null };

type ViewRow = {
  created_at: string;
  visitor_key: string | null;
  parent_id: string | null;
  parents: { first_name: string | null; last_name: string | null } | null;
};

type TeamWithParents = {
  name: string;
  roster: {
    players: {
      player_parents: {
        parents: {
          id: string;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string | null;
        } | null;
      }[];
    } | null;
  }[];
};

export default async function EventManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: event }, { data: signupsRaw }, { data: viewsRaw }, { data: invitesRaw }] =
    await Promise.all([
    supabase
      .from("events")
      .select("*, event_fields(*), event_price_tiers(*, event_tier_fields(*))")
      .eq("id", id)
      .single(),
    supabase
      .from("event_signups")
      .select("*")
      .eq("event_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("event_views")
      .select("created_at, visitor_key, parent_id, parents(first_name, last_name)")
      .eq("event_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("event_invites")
      .select("parent_id, name, sent_at")
      .eq("event_id", id)
      .order("name", { ascending: true }),
  ]);

  if (!event) notFound();
  const ev = event as EventWithDetails;
  ev.event_fields = [...(ev.event_fields ?? [])].sort((a, b) => a.position - b.position);

  const signups = (signupsRaw ?? []) as EventSignup[];

  // Open metrics: total opens, unique visitors (by parent or anon key), and a
  // recent list with names where the visitor was a known parent.
  // parent_id is a to-one FK, so `parents` is a single row at runtime even
  // though the query builder types it as an array.
  const views = (viewsRaw ?? []) as unknown as ViewRow[];
  const uniqueKeys = new Set(
    views.map((v, i) => v.parent_id ?? v.visitor_key ?? `anon-${i}`)
  );
  const recentOpens = views.slice(0, 25).map((v) => ({
    name: v.parents
      ? `${v.parents.first_name ?? ""} ${v.parents.last_name ?? ""}`.trim() || "Parent"
      : "Anonymous visitor",
    at: v.created_at,
  }));
  const metrics = {
    opensTotal: views.length,
    opensUnique: uniqueKeys.size,
    recentOpens,
  };

  // Recipients for the "invite the team" buttons (only when an event is tied
  // to a team). De-duplicated by parent.
  const recipients: Recipient[] = [];
  let teamName: string | null = null;
  if (ev.team_id) {
    const { data: teamRaw } = await supabase
      .from("teams")
      .select(
        "name, roster(players(player_parents(parents(id, first_name, last_name, email, phone))))"
      )
      .eq("id", ev.team_id)
      .maybeSingle();
    const team = teamRaw as TeamWithParents | null;
    teamName = team?.name ?? null;
    const seen = new Set<string>();
    for (const r of team?.roster ?? []) {
      for (const pp of r.players?.player_parents ?? []) {
        const p = pp.parents;
        if (!p || seen.has(p.id)) continue;
        seen.add(p.id);
        recipients.push({
          name: `${p.first_name} ${p.last_name}`,
          email: p.email,
          phone: p.phone,
        });
      }
    }
  }

  // Build the absolute share link server-side so client components don't need
  // to read window (avoids hydration mismatch + effect-driven state).
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const shareUrl = `${proto}://${h.get("host")}/event/${ev.slug}`;

  // Invite funnel: invited (event_invites) → opened (views) → accepted (signups).
  const invites = (invitesRaw ?? []) as {
    parent_id: string | null;
    name: string | null;
    sent_at: string;
  }[];
  const openedParentIds = views.map((v) => v.parent_id).filter((x): x is string => Boolean(x));
  const acceptedParentIds = signups
    .map((s) => s.parent_id)
    .filter((x): x is string => Boolean(x));
  const emailableCount = recipients.filter((r) => r.email).length;

  const dateStr = ev.starts_at
    ? new Date(ev.starts_at).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })
    : null;

  return (
    <div className="space-y-6">
      <Link href="/events" className="text-sm text-gray-500 hover:text-gray-700">
        ← Events
      </Link>

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{ev.title}</h1>
          <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {ev.status}
          </span>
        </div>
        {dateStr && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{dateStr}</p>}
        {ev.location && <p className="text-sm text-gray-500 dark:text-gray-400">{ev.location}</p>}
        {ev.description && (
          <div
            className={`mt-2 text-gray-700 dark:text-gray-200 ${markdownClass}`}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(ev.description) }}
          />
        )}
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-4">
        <EventManageControls eventId={ev.id} shareUrl={shareUrl} status={ev.status} />
        {ev.status === "published" && recipients.length > 0 && (
          <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-4">
            <EventEmailInvite eventId={ev.id} emailCount={emailableCount} />
            <EventInviteButton
              title={ev.title}
              shareUrl={shareUrl}
              recipients={recipients}
              teamName={teamName}
            />
          </div>
        )}
      </div>

      {invites.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Invites
          </h2>
          <InvitesPanel
            invites={invites}
            openedParentIds={openedParentIds}
            acceptedParentIds={acceptedParentIds}
          />
        </section>
      )}

      <SignupsDashboard fields={ev.event_fields} signups={signups} metrics={metrics} />
    </div>
  );
}
