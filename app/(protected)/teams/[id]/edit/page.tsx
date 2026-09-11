import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TeamForm from "../../_components/TeamForm";
import { updateTeam } from "../../actions";
import type { Team } from "@/lib/types";

export default async function EditTeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: team }, { data: roster }] = await Promise.all([
    supabase.from("teams").select("*").eq("id", id).single(),
    supabase
      .from("roster")
      .select("players(player_parents(parents(id, first_name, last_name)))")
      .eq("team_id", id),
  ]);

  if (!team) notFound();

  // Parents "on the team" = parents linked via roster → players → player_parents
  // → parents, de-duplicated by parent id.
  type ParentRow = { id: string; first_name: string; last_name: string };
  const rosterRows = (roster ?? []) as unknown as Array<{
    players: { player_parents: Array<{ parents: ParentRow | null }> } | null;
  }>;
  const parentsById = new Map<string, ParentRow>();
  for (const entry of rosterRows) {
    for (const pp of entry.players?.player_parents ?? []) {
      if (pp.parents) parentsById.set(pp.parents.id, pp.parents);
    }
  }
  const teamParents = Array.from(parentsById.values()).sort((a, b) =>
    `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
  );

  const updateWithId = updateTeam.bind(null, id);

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <Link href="/teams" className="text-sm text-blue-600 hover:underline">
          ← Back to teams
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-3">Edit team</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <TeamForm team={team as Team} action={updateWithId} teamParents={teamParents} />
      </div>
    </div>
  );
}
