import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AddPlayerList from "../../_components/AddPlayerList";

export default async function AddPlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: team }, { data: rosterEntries }, { data: allPlayers }] =
    await Promise.all([
      supabase.from("teams").select("id, name").eq("id", id).single(),
      supabase.from("roster").select("player_id").eq("team_id", id),
      supabase
        .from("players")
        .select("id, first_name, last_name, grade")
        .order("last_name")
        .order("first_name"),
    ]);

  if (!team) notFound();

  const onTeam = new Set((rosterEntries ?? []).map((r) => r.player_id));
  const available = (allPlayers ?? []).filter((p) => !onTeam.has(p.id));

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <Link
          href={`/teams/${id}`}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to {team.name}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-3">Add players</h1>
        <p className="text-sm text-gray-500 mt-1">
          {available.length === 0
            ? "All players are already on this team."
            : `${available.length} player${available.length !== 1 ? "s" : ""} available to add.`}
        </p>
      </div>

      {available.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <AddPlayerList teamId={id} players={available} />
        </div>
      )}

      {available.length === 0 && (
        <div className="text-center py-6">
          <Link
            href="/players/new"
            className="text-sm text-blue-600 hover:underline"
          >
            Create a new player first →
          </Link>
        </div>
      )}
    </div>
  );
}
