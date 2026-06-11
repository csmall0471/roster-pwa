import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SeasonView, { type DivisionRow, type PlayerRow } from "./SeasonView";
import { selectAll } from "../db";

export default async function SeasonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: season } = await supabase
    .from("tb_seasons")
    .select("id, name, sport, status")
    .eq("id", id)
    .maybeSingle();

  if (!season) notFound();

  const [{ data: divisions }, players] = await Promise.all([
    supabase
      .from("tb_divisions")
      .select("id, name, position")
      .eq("season_id", id)
      .order("position", { ascending: true }),
    selectAll((from, to) =>
      supabase
        .from("tb_players")
        .select(
          "id, division_id, first_name, last_name, gender, age_group, school, coach_first, coach_last, team_name, buddy_first, buddy_last, practice_nights, package_name"
        )
        .eq("season_id", id)
        .order("last_name", { ascending: true })
        .order("id")
        .range(from, to)
    ),
  ]);

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/tools/roster-creator"
          className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800"
        >
          ← Roster Creator
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
          {season.name}
          {season.sport && (
            <span className="ml-2 text-base font-normal text-gray-400">{season.sport}</span>
          )}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {(divisions ?? []).length} divisions · {(players ?? []).length} players imported
        </p>
      </div>

      {(players ?? []).length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Next steps
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
            <Link
              href={`/tools/roster-creator/${id}/confirm`}
              className="group rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 p-4 hover:border-blue-400"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">1</span>
                <span className="font-semibold text-gray-900 dark:text-white">Confirm coaches &amp; teams</span>
                <span className="ml-auto text-blue-600 dark:text-blue-400 group-hover:translate-x-0.5 transition-transform">→</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                Claude reads every signup and cleans up the messy coach, team, and buddy entries
                automatically. You just settle the few things it&rsquo;s unsure about. <strong>Do this first.</strong>
              </p>
            </Link>
            <Link
              href={`/tools/roster-creator/${id}/teams`}
              className="group rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 hover:border-gray-400"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-400 dark:bg-gray-600 text-xs font-bold text-white">2</span>
                <span className="font-semibold text-gray-900 dark:text-white">Build teams</span>
                <span className="ml-auto text-gray-400 group-hover:translate-x-0.5 transition-transform">→</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                Auto-group players into teams by your priorities, then drag to fix anything.
                Export the rosters as CSV, PDF, or email when you&rsquo;re done.
              </p>
            </Link>
            <Link
              href={`/tools/roster-creator/${id}/schedule`}
              className="group rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 hover:border-gray-400"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-400 dark:bg-gray-600 text-xs font-bold text-white">3</span>
                <span className="font-semibold text-gray-900 dark:text-white">Practice schedule</span>
                <span className="ml-auto text-gray-400 group-hover:translate-x-0.5 transition-transform">→</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                Assign each team a field and practice time on a drag-and-drop grid. Conflicts for
                double-booked fields or coaches are flagged automatically.
              </p>
            </Link>
          </div>
        </>
      )}

      <SeasonView
        seasonId={season.id as string}
        divisions={(divisions ?? []) as DivisionRow[]}
        players={(players ?? []) as PlayerRow[]}
      />
    </div>
  );
}
