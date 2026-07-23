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

  // "Who's coming" — one line per family (signup): the player(s), then a summary
  // of the rest (e.g. "Ben Jewell + 2 siblings + 2 adults"). Read via the service
  // client (signups aren't public under RLS) but expose ONLY names/counts — never
  // contact info, amounts, or paid status. Non-players are summarized by their
  // tier's label (parenthetical notes stripped). Alphabetized by the lead name.
  const service = createServiceClient();
  const { data: signupRows } = await service
    .from("event_signups")
    .select("name, attendees, declined")
    .eq("event_id", ev.id);

  const tierInfo = new Map(
    ev.event_price_tiers.map((t) => [t.id, { isPlayer: t.is_player, label: t.label }])
  );
  const cleanLabel = (l: string) => l.replace(/\s*\(.*$/, "").trim();
  const singularize = (l: string, n: number) =>
    n === 1 && /s$/i.test(l) ? l.replace(/s$/i, "") : l;

  let total = 0;
  const fam: { lead: string; extras: string[]; sortKey: string }[] = [];
  for (const row of signupRows ?? []) {
    if (row.declined) continue;
    const attendees = ((row.attendees ?? []) as SignupAttendee[]).filter(
      (a) => (a.status ?? "attending") !== "declined"
    );
    if (attendees.length === 0) continue;

    const players: string[] = [];
    const others = new Map<string, number>(); // cleaned tier label → count (insertion order = tier order)
    for (const a of attendees) {
      total++;
      const info = tierInfo.get(a.tier_id);
      if (info?.isPlayer ?? a.is_player) {
        const nm = a.name?.trim();
        if (nm) players.push(nm);
        else others.set("players", (others.get("players") ?? 0) + 1);
      } else {
        const label = cleanLabel(info?.label ?? a.tier_label ?? "guests") || "guests";
        others.set(label, (others.get(label) ?? 0) + 1);
      }
    }
    const lead = players.length ? players.join(", ") : row.name?.trim() || "Guest";
    const extras = [...others.entries()].map(
      ([label, n]) => `${n} ${singularize(label, n).toLowerCase()}`
    );
    fam.push({ lead, extras, sortKey: lead.toLowerCase() });
  }
  fam.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const attendance: AttendanceSummary = {
    total,
    families: fam.map(({ lead, extras }) => ({ lead, extras })),
  };

  return <SignupFlow event={ev} attendance={attendance} />;
}
