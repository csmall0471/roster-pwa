import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function countOf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  seasonId: string
): Promise<number> {
  const { count } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("season_id", seasonId);
  return count ?? 0;
}

export default async function SeasonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: season } = await supabase
    .from("tb_seasons")
    .select("id, name, sport, status")
    .eq("id", id)
    .maybeSingle();
  if (!season) notFound();

  const [divisions, teams, coaches, players] = await Promise.all([
    countOf(supabase, "tb_divisions", id),
    countOf(supabase, "tb_teams", id),
    countOf(supabase, "tb_coaches", id),
    countOf(supabase, "tb_players", id),
  ]);

  const grouped = season.status === "grouped";

  const card =
    "group rounded-xl border p-4 transition-colors flex flex-col gap-2 " +
    "border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-400 dark:hover:border-gray-600";

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
          {season.sport && <span className="ml-2 text-base font-normal text-gray-400">{season.sport}</span>}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {divisions} divisions · {teams} teams · {coaches} coaches · {players} players
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Step 1 — Structure */}
        <Link href={`/tools/roster-creator/${id}/setup`} className={card + " border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20"}>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">1</span>
            <span className="font-semibold text-gray-900 dark:text-white">Structure</span>
            <span className="ml-auto text-blue-600 dark:text-blue-400 group-hover:translate-x-0.5 transition-transform">→</span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Divisions, coaches &amp; teams, practice days. Upload a coaches file or build it by hand —
            add, edit, or remove anything.
          </p>
          <p className="text-xs text-gray-400">{divisions} divisions · {teams} teams</p>
        </Link>

        {/* Step 2 — Players */}
        <Link href={`/tools/roster-creator/${id}/players`} className={card}>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-400 dark:bg-gray-600 text-xs font-bold text-white">2</span>
            <span className="font-semibold text-gray-900 dark:text-white">Players</span>
            <span className="ml-auto text-gray-400 group-hover:translate-x-0.5 transition-transform">→</span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Import your signup export, then add, edit, or remove players and fix which division they&rsquo;re in.
          </p>
          <p className="text-xs text-gray-400">{players} players</p>
        </Link>

        {/* Step 3 — Build teams */}
        <Link href={`/tools/roster-creator/${id}/confirm`} className={card}>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-400 dark:bg-gray-600 text-xs font-bold text-white">3</span>
            <span className="font-semibold text-gray-900 dark:text-white">Build teams</span>
            <span className="ml-auto text-gray-400 group-hover:translate-x-0.5 transition-transform">→</span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Match every coach/buddy request, then auto-fill balanced teams. Drag to fix anything, then
            export.
          </p>
          {grouped && <p className="text-xs text-green-600 dark:text-green-400">Teams generated</p>}
        </Link>

        {/* Practice schedule */}
        <Link href={`/tools/roster-creator/${id}/schedule`} className={card}>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-400 dark:bg-gray-600 text-xs font-bold text-white">★</span>
            <span className="font-semibold text-gray-900 dark:text-white">Practice schedule</span>
            <span className="ml-auto text-gray-400 group-hover:translate-x-0.5 transition-transform">→</span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Assign each team a field and practice time on a drag-and-drop grid; conflicts are flagged.
          </p>
        </Link>
      </div>

      {grouped && (
        <div className="mt-4">
          <Link
            href={`/tools/roster-creator/${id}/teams`}
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Open the teams board →
          </Link>
        </div>
      )}
    </div>
  );
}
