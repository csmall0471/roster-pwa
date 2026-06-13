import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EventWithDetails } from "@/lib/types";
import EventBuilder from "../../_components/EventBuilder";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: event }, { data: teams }, { data: eventTeams }] = await Promise.all([
    supabase
      .from("events")
      .select("*, event_fields(*), event_price_tiers(*, event_tier_fields(*))")
      .eq("id", id)
      .single(),
    supabase.from("teams").select("id, name, season, age_group, season_start").order("name", { ascending: true }).order("season_start", { ascending: false }),
    supabase.from("event_teams").select("team_id").eq("event_id", id),
  ]);

  if (!event) notFound();

  // Ensure child rows come back ordered by position.
  const ev = event as EventWithDetails;
  ev.event_fields = [...(ev.event_fields ?? [])].sort((a, b) => a.position - b.position);
  ev.event_price_tiers = [...(ev.event_price_tiers ?? [])].sort((a, b) => a.position - b.position);

  // Full team set, primary (events.team_id) first.
  const teamIds = [
    ...(ev.team_id ? [ev.team_id as string] : []),
    ...((eventTeams ?? []).map((r) => r.team_id as string).filter((t) => t !== ev.team_id)),
  ];

  return (
    <div>
      <Link href={`/events/${id}`} className="text-sm text-gray-500 hover:text-gray-700">
        ← Back
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-2 mb-6">Edit event</h1>
      <EventBuilder teams={teams ?? []} event={ev} teamIds={teamIds} />
    </div>
  );
}
