import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { RATING_CATEGORIES } from "@/lib/types";
import type { PlayerWithParents, RankPlayer, RatingValues } from "@/lib/types";
import PlayersTabbed from "./_components/PlayersTabbed";

export default async function PlayersPage() {
  const supabase = await createClient();
  const [{ data, error }, { data: photoRows }, { data: teamRows }, { data: ratingRows }] =
    await Promise.all([
      supabase
        .from("players")
        .select(
          `*, player_parents(relationship, parents(id, first_name, last_name, email, phone)), roster(team_id, teams(id, name, sport))`
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
      supabase
        .from("player_ratings")
        .select("player_id, good_person, coachable, personality, teammate, hard_working"),
    ]);

  const primaryPhotos: Record<string, string> = {};
  for (const row of photoRows ?? []) {
    primaryPhotos[row.player_id] = row.public_url;
  }

  // Ranking-tab data: lean per-player shape + the saved 1–10 ratings. The teams
  // join carries `sport` at runtime (used for filtering) though the shared
  // PlayerWithParents type only models id/name, so read it off a loose row.
  type RankRow = {
    id: string;
    first_name: string;
    last_name: string;
    date_of_birth: string | null;
    roster?: Array<{ teams?: { name?: string; sport?: string | null } }>;
  };
  const rankPlayers: RankPlayer[] = ((data ?? []) as unknown as RankRow[]).map((p) => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    date_of_birth: p.date_of_birth,
    photo: primaryPhotos[p.id] ?? null,
    teams: (p.roster ?? []).map((r) => ({ name: r.teams?.name ?? "", sport: r.teams?.sport ?? "" })),
  }));

  const ratings: Record<string, RatingValues> = {};
  for (const r of (ratingRows ?? []) as Array<Record<string, number | string>>) {
    const v = {} as RatingValues;
    for (const { key } of RATING_CATEGORIES) v[key] = Number(r[key] ?? 5);
    ratings[r.player_id as string] = v;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Players</h1>
        <div className="flex gap-2">
          <Link
            href="/players/cards"
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Manage cards
          </Link>
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
            href="/players/import-json"
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Import JSON
          </Link>
          <Link
            href="/players/import-csv"
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Import CSV
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

      <PlayersTabbed
        players={(data ?? []) as unknown as PlayerWithParents[]}
        primaryPhotos={primaryPhotos}
        teams={(teamRows ?? []) as { id: string; name: string; season: string }[]}
        rankPlayers={rankPlayers}
        ratings={ratings}
      />
    </div>
  );
}
