import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { EventWithDetails, SignupAttendee } from "@/lib/types";
import SignupFlow, { type AttendanceSummary } from "./SignupFlow";

export const dynamic = "force-dynamic";

export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("*, event_fields(*), event_price_tiers(*, event_tier_fields(*))")
    .eq("slug", slug)
    .maybeSingle();

  // Only published events are publicly viewable (RLS enforces this too).
  if (!event || event.status !== "published") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-orange-50 via-white to-white px-4 text-center">
        <div className="text-4xl mb-4">🏀</div>
        <h1 className="text-xl font-bold text-gray-900">Event not available</h1>
        <p className="mt-2 text-sm text-gray-500">
          This signup link is invalid or the event is no longer open.
        </p>
      </div>
    );
  }

  const ev = event as EventWithDetails;
  ev.event_fields = [...(ev.event_fields ?? [])].sort((a, b) => a.position - b.position);
  ev.event_price_tiers = [...(ev.event_price_tiers ?? [])].sort((a, b) => a.position - b.position);

  // "Who's coming" summary. Read via the service client (signups aren't public
  // under RLS) but expose ONLY names grouped by tier — never contact info,
  // amounts, or paid status. Attendees are grouped by their tier, ordered to
  // match the event's tiers.
  const service = createServiceClient();
  const { data: signupRows } = await service
    .from("event_signups")
    .select("attendees, declined")
    .eq("event_id", ev.id);

  const tierPos = new Map(ev.event_price_tiers.map((t, i) => [t.id, t.position ?? i]));
  const byTier = new Map<string, { label: string; names: string[]; unnamed: number; pos: number }>();
  let total = 0;
  for (const row of signupRows ?? []) {
    if (row.declined) continue;
    for (const a of ((row.attendees ?? []) as SignupAttendee[])) {
      if ((a.status ?? "attending") === "declined") continue;
      total++;
      let g = byTier.get(a.tier_id);
      if (!g) {
        g = { label: a.tier_label, names: [], unnamed: 0, pos: tierPos.get(a.tier_id) ?? 99 };
        byTier.set(a.tier_id, g);
      }
      const nm = a.name?.trim();
      if (nm) g.names.push(nm);
      else g.unnamed++;
    }
  }
  const attendance: AttendanceSummary = {
    total,
    groups: [...byTier.values()]
      .sort((x, y) => x.pos - y.pos)
      .map(({ label, names, unnamed }) => ({ label, names, unnamed })),
  };

  return <SignupFlow event={ev} attendance={attendance} />;
}
