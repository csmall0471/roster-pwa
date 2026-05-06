import { createClient } from "@/lib/supabase/server";
import CardGrid from "./_components/CardGrid";

export default async function CardsPage() {
  const supabase = await createClient();

  const [{ data: photos }, { data: teams }] = await Promise.all([
    supabase
      .from("player_photos")
      .select("*, players(id, first_name, last_name)")
      .order("created_at", { ascending: false }),
    supabase
      .from("teams")
      .select("id, name, season, organization")
      .order("season_start", { ascending: false }),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Manage Cards</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {photos?.length ?? 0} cards total
        </p>
      </div>
      <CardGrid photos={photos ?? []} teams={teams ?? []} />
    </div>
  );
}
