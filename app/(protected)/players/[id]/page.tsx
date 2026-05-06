import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import type { PlayerPhoto } from "@/lib/types";
import PhotoGallery from "./_components/PhotoGallery";

function calcAge(dob: string): number {
  const birth = new Date(dob + "T00:00:00");
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export default async function PlayerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: player }, { data: photos }, { data: seasons }] =
    await Promise.all([
      supabase
        .from("players")
        .select(
          `*, player_parents(relationship, parents(id, first_name, last_name, email, phone))`
        )
        .eq("id", id)
        .single(),
      supabase
        .from("player_photos")
        .select("*")
        .eq("player_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("roster")
        .select(`jersey_number, status, teams(id, name, sport, season, age_group, organization, season_start, season_end)`)
        .eq("player_id", id)
        .order("created_at", { ascending: false }),
    ]);

  if (!player) notFound();

  const primary = (photos ?? []).find((p: PlayerPhoto) => p.is_primary);

  type SeasonRow = {
    jersey_number: number | null;
    status: string;
    teams: {
      id: string; name: string; sport: string; season: string; age_group: string;
      organization: string | null; season_start: string | null; season_end: string | null;
    };
  };

  const parentRows = (
    player.player_parents as Array<{
      relationship: string;
      parents: { id: string; first_name: string; last_name: string; email: string; phone: string | null };
    }>
  ).map((pp) => pp.parents);

  return (
    <div className="max-w-2xl">
      {/* Back */}
      <Link href="/players" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← Players
      </Link>

      {/* Header */}
      <div className="flex items-start gap-5 mt-4 mb-6">
        {/* Primary photo */}
        <div className="shrink-0">
          {primary ? (
            <Image
              src={primary.public_url}
              alt={`${player.first_name} ${player.last_name}`}
              width={96}
              height={128}
              className="w-24 h-32 object-cover rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none"
            />
          ) : (
            <div className="w-24 h-32 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-300 dark:text-gray-600 text-3xl">
              👤
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {player.first_name} {player.last_name}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {[
              player.date_of_birth ? `Age ${calcAge(player.date_of_birth)}` : null,
              player.shirt_size ? `Size ${player.shirt_size}` : null,
              player.date_of_birth
                ? `b. ${new Date(player.date_of_birth + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                : null,
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </p>
          {player.notes && (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic mt-1">{player.notes}</p>
          )}

          <div className="flex gap-2 mt-3">
            <Link
              href={`/players/upload?player=${id}`}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              + Add card
            </Link>
            <Link
              href={`/players/${id}/edit`}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Edit
            </Link>
          </div>
        </div>
      </div>

      {/* Parents */}
      {parentRows.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
            Parents / Guardians
          </h2>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
            {parentRows.map((par) => (
              <div key={par.id} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-medium text-gray-900 dark:text-white text-sm">
                  {par.first_name} {par.last_name}
                </span>
                {par.phone && (
                  <a href={`tel:${par.phone}`} className="text-sm text-blue-600 hover:underline tabular-nums">
                    {par.phone}
                  </a>
                )}
                {par.email && (
                  <a href={`mailto:${par.email}`} className="text-sm text-blue-600 hover:underline truncate max-w-[240px]">
                    {par.email}
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Season history */}
      {seasons && seasons.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
            Season history
          </h2>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
            {(seasons as unknown as SeasonRow[]).map((row, i) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between gap-4">
                <div>
                  <Link
                    href={`/teams/${row.teams.id}`}
                    className="font-medium text-gray-900 dark:text-white text-sm hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    {row.teams.name}
                  </Link>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {[row.teams.organization, row.teams.sport, row.teams.age_group, row.teams.season]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {(row.teams.season_start || row.teams.season_end) && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {row.teams.season_start
                        ? new Date(row.teams.season_start + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })
                        : ""}
                      {row.teams.season_start && row.teams.season_end ? " – " : ""}
                      {row.teams.season_end
                        ? new Date(row.teams.season_end + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })
                        : ""}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {row.jersey_number != null && (
                    <span className="text-xs font-mono text-gray-500 dark:text-gray-400">#{row.jersey_number}</span>
                  )}
                  <span
                    className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                      row.status === "active"
                        ? "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {row.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Photo gallery */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
          Season cards ({photos?.length ?? 0})
        </h2>
        {photos && photos.length > 0 ? (
          <PhotoGallery
            photos={photos as PlayerPhoto[]}
            playerId={id}
            playerTeams={(seasons ?? []).map((r: any) => ({
              id: r.teams.id,
              name: r.teams.name,
              season: r.teams.season,
            }))}
          />
        ) : (
          <div className="text-center py-10 text-gray-400 dark:text-gray-500">
            <p className="text-sm">No cards yet.</p>
            <Link
              href={`/players/upload?player=${id}`}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-1 inline-block"
            >
              Upload their first card →
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
