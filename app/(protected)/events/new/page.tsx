import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import EventBuilder from "../_components/EventBuilder";

export default async function NewEventPage() {
  const supabase = await createClient();
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, season, age_group, season_start")
    .order("name", { ascending: true })
    .order("season_start", { ascending: false });

  return (
    <div>
      <Link href="/events" className="text-sm text-gray-500 hover:text-gray-700">
        ← Events
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-2 mb-6">New event</h1>
      <EventBuilder teams={teams ?? []} />
    </div>
  );
}
