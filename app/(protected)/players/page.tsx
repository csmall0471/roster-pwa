import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { PlayerWithParents } from "@/lib/types";
import PlayerDirectory from "./_components/PlayerDirectory";

export default async function PlayersPage() {
  const supabase = await createClient();
  const [{ data, error }, { data: photoRows }, { data: teamRows }] = await Promise.all([
    supabase
      .from("players")
      .select(
        `*, player_parents(relationship, parents(id, first_name, last_name, email, phone)), roster(team_id, teams(id, name))`
      )
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true }),
    supabase
      .from("player_photos")
      .select("player_id, public_url")
      .eq("is_primary", true),
    supabase
      .from("teams")
      .select("id, name, season")
      .order("name"),
  ]);

  const primaryPhotos: Record<string, string> = {};
  for (const row of photoRows ?? []) {
    primaryPhotos[row.player_id] = row.public_url;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Players</h1>
        <div className="flex gap-2">
          <Link
            href="/players/upload"
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Upload cards
          </Link>
          <Link
            href="/players/import"
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Import TSV
          </Link>
          <Link
            href="/players/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            + Add player
          </Link>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 mb-4">
          {error.message}
        </p>
      )}

      <PlayerDirectory
        players={(data ?? []) as unknown as PlayerWithParents[]}
        primaryPhotos={primaryPhotos}
        teams={(teamRows ?? []) as { id: string; name: string; season: string }[]}
      />
    </div>
  );
}
