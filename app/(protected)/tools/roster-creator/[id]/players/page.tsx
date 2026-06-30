import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Stepper from "../../Stepper";
import UploadCard from "../../UploadCard";
import { selectAll } from "../../db";
import { playerDedupeKey } from "../../fields";
import ConfirmView from "../confirm/ConfirmView";
import PlayerEditor, { type EditPlayer, type EditDivision } from "./PlayerEditor";
import DedupeButton from "./DedupeButton";

export default async function PlayersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ analyze?: string }>;
}) {
  const { id } = await params;
  const autoRun = (await searchParams)?.analyze === "1";
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

  // Count players that duplicate an earlier one (same name + age group) so the
  // dedupe button can offer to clean them up.
  const seenKeys = new Set<string>();
  let duplicateCount = 0;
  for (const p of editPlayers) {
    const key = playerDedupeKey(p.first_name, p.last_name, p.age_group ?? "");
    if (seenKeys.has(key)) duplicateCount++;
    else seenKeys.add(key);
  }

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

      {/* Analyze & build — kept at the TOP so the progress bar is in view */}
      {editPlayers.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            Analyze &amp; build
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Claude reads every signup and matches each coach, buddy, and practice-night request against
            your roster. Run it here, then continue to build teams.
          </p>
          <ConfirmView seasonId={id} autoRun={autoRun} />
        </section>
      )}

      {/* Import — hidden while an analyze is running (?analyze=1), otherwise
          collapsed once players exist so it's out of the way but available. */}
      {!autoRun && (
        <details
          open={editPlayers.length === 0}
          className="mb-6 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
        >
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Import a signup file
            {editPlayers.length > 0 && (
              <span className="font-normal normal-case text-xs text-gray-400">— import another file</span>
            )}
          </summary>
          <div className="px-4 pb-4">
            <UploadCard seasons={[seasonOption]} lockedSeason={seasonOption} />
          </div>
        </details>
      )}

      {editPlayers.length > 0 && <DedupeButton seasonId={id} count={duplicateCount} />}

      <PlayerEditor seasonId={id} divisions={editDivisions} players={editPlayers} />
    </div>
  );
}
