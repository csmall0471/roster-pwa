import { createClient } from "@/lib/supabase/server";
import type { EventWithDetails } from "@/lib/types";
import SignupFlow from "./SignupFlow";

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

  return <SignupFlow event={ev} />;
}
