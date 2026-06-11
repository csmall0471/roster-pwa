import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import UploadCard from "./UploadCard";
import DeleteSeasonButton from "./DeleteSeasonButton";

export default async function RosterCreatorPage() {
  const supabase = await createClient();

  const { data: seasons } = await supabase
    .from("tb_seasons")
    .select("id, name, sport, status, created_at, tb_players(count), tb_divisions(count)")
    .order("created_at", { ascending: false });

  type SeasonRow = {
    id: string;
    name: string;
    sport: string | null;
    status: string;
    created_at: string;
    tb_players: { count: number }[];
    tb_divisions: { count: number }[];
  };
  const rows = (seasons ?? []) as SeasonRow[];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Roster Creator</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Turn an external signup export (CSV or Excel) into balanced team rosters that respect
          parents&rsquo; coach, buddy, and practice-night requests.
        </p>
      </div>

      <ol className="mb-6 grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
        {[
          ["1. Upload", "Drop in your signup CSV/Excel and map the columns."],
          ["2. Resolve", "Clean up messy coach & buddy entries — fuzzy matching plus an optional Claude pass."],
          ["3. Build teams", "Auto-group by your priorities, then drag players to fix anything."],
          ["4. Export", "Download CSV, print/PDF, or email the rosters."],
        ].map(([title, desc]) => (
          <li key={title} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
            <p className="font-semibold text-gray-900 dark:text-white">{title}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{desc}</p>
          </li>
        ))}
      </ol>

      <UploadCard seasons={rows.map((s) => ({ id: s.id, name: s.name }))} />

      {rows.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Seasons
          </h2>
          <ul className="divide-y divide-gray-200 dark:divide-gray-800 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            {rows.map((s) => {
              const players = s.tb_players?.[0]?.count ?? 0;
              const divisions = s.tb_divisions?.[0]?.count ?? 0;
              return (
                <li key={s.id} className="flex items-center hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <Link
                    href={`/tools/roster-creator/${s.id}`}
                    className="flex flex-1 min-w-0 items-center justify-between px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {s.name}
                        {s.sport && (
                          <span className="ml-2 text-xs font-normal text-gray-400">{s.sport}</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {divisions} {divisions === 1 ? "division" : "divisions"} · {players}{" "}
                        {players === 1 ? "player" : "players"} ·{" "}
                        {new Date(s.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-1 text-gray-600 dark:text-gray-300">
                      {s.status}
                    </span>
                  </Link>
                  <div className="pr-3 pl-1">
                    <DeleteSeasonButton seasonId={s.id} seasonName={s.name} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
