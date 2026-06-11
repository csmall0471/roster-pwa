import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Stepper from "../../Stepper";
import UploadCard from "../../UploadCard";
import { selectAll } from "../../db";
import PlayerEditor, { type EditPlayer, type EditDivision } from "./PlayerEditor";

export default async function PlayersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: season } = await supabase.from("tb_seasons").select("id, name").eq("id", id).maybeSingle();
  if (!season) notFound();

  const [{ data: divisions }, players] = await Promise.all([
    supabase.from("tb_divisions").select("id, name, position").eq("season_id", id).order("position"),
    selectAll((from, to) =>
      supabase
        .from("tb_players")
        .select(
          "id, division_id, first_name, last_name, gender, age_group, school, coach_first, coach_last, team_name, buddy_first, buddy_last, practice_nights"
        )
        .eq("season_id", id)
        .order("last_name")
        .order("id")
        .range(from, to)
    ),
  ]);

  const seasonOption = { id: season.id as string, name: season.name as string };
  const editDivisions: EditDivision[] = (divisions ?? []).map((d) => ({ id: d.id as string, name: d.name as string }));
  const editPlayers = (players ?? []) as EditPlayer[];

  return (
    <div>
      <div className="mb-4">
        <Link
          href={`/tools/roster-creator/${id}`}
          className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800"
        >
          ← {season.name}
        </Link>
      </div>
      <Stepper seasonId={id} current="players" />
      <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Players</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
        Import your signup export to bulk-add players, then add, edit, or remove anyone by hand.
      </p>

      {editDivisions.length === 0 && (
        <p className="mb-4 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          You haven&rsquo;t set up any divisions yet.{" "}
          <Link href={`/tools/roster-creator/${id}/setup`} className="underline font-semibold">
            Add structure first
          </Link>{" "}
          so imported players land in the right division.
        </p>
      )}

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          Import a signup file
        </h2>
        <UploadCard seasons={[seasonOption]} lockedSeason={seasonOption} />
      </section>

      <PlayerEditor seasonId={id} divisions={editDivisions} players={editPlayers} />

      <div className="sticky bottom-0 -mx-4 mt-6 border-t border-gray-200 dark:border-gray-800 bg-gray-50/95 dark:bg-gray-950/95 px-4 py-3 backdrop-blur flex items-center gap-3">
        <Link
          href={`/tools/roster-creator/${id}/confirm`}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Continue to build teams →
        </Link>
        <span className="text-xs text-gray-400">{editPlayers.length} players</span>
      </div>
    </div>
  );
}
