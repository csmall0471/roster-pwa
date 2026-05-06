import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Team } from "@/lib/types";
import RosterTable from "../_components/RosterTable";

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateRange(start: string | null, end: string | null) {
  if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
  if (start) return `From ${formatDate(start)}`;
  if (end) return `Until ${formatDate(end)}`;
  return null;
}

export default async function TeamDetailPage({
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
      .select(
        `id, jersey_number, status,
         players(
           id, first_name, last_name, grade,
           player_parents(parents(id, first_name, last_name, phone, email))
         )`
      )
      .eq("team_id", id),
  ]);

  if (!team) notFound();

  const t = team as Team;

  const playerIds = (roster ?? [])
    .map((r) => (r.players as unknown as { id: string } | null)?.id)
    .filter(Boolean) as string[];

  // Fetch primary photos + past seasons in parallel
  const [{ data: photoRows }, { data: pastSeasons }] = await Promise.all([
    playerIds.length
      ? supabase
          .from("player_photos")
          .select("player_id, public_url")
          .eq("is_primary", true)
          .in("player_id", playerIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("teams")
      .select("id, season, season_start, season_end, age_group, organization")
      .eq("name", t.name)
      .neq("id", id)
      .order("season_start", { ascending: false }),
  ]);

  const primaryPhotos: Record<string, string> = {};
  for (const row of photoRows ?? []) {
    primaryPhotos[row.player_id] = row.public_url;
  }

  const sorted = [...(roster ?? [])].sort((a, b) => {
    const la = (a.players as unknown as { last_name: string } | null)?.last_name ?? "";
    const lb = (b.players as unknown as { last_name: string } | null)?.last_name ?? "";
    return la.localeCompare(lb);
  });

  const meta = [t.organization, t.sport, t.age_group, t.season].filter(Boolean).join(" · ");
  const dateRange = formatDateRange(t.season_start, t.season_end);

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <Link href="/teams" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            ← Teams
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{t.name}</h1>
          {meta && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{meta}</p>
          )}
          {dateRange && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{dateRange}</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <Link
            href={`/teams/${id}/edit`}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Edit
          </Link>
          <Link
            href={`/teams/${id}/add-player`}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            + Add players
          </Link>
        </div>
      </div>

      {/* Roster */}
      {sorted.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <p className="text-lg font-medium mb-1">No players on this team yet</p>
          <Link href={`/teams/${id}/add-player`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            Add players →
          </Link>
        </div>
      ) : (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <RosterTable roster={sorted as any} teamId={id} primaryPhotos={primaryPhotos} />
      )}

      {/* Past seasons of this team */}
      {pastSeasons && pastSeasons.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
            Other {t.name} seasons
          </h2>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
            {pastSeasons.map((s) => {
              const sDateRange = formatDateRange(s.season_start, s.season_end);
              const sMeta = [s.organization, s.age_group, s.season].filter(Boolean).join(" · ");
              return (
                <Link
                  key={s.id}
                  href={`/teams/${s.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div>
                    {sMeta && (
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{sMeta}</p>
                    )}
                    {sDateRange && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sDateRange}</p>
                    )}
                    {!sMeta && !sDateRange && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">Season</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500">→</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
