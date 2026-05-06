import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";

function formatDateRange(start: string | null, end: string | null) {
  const fmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  if (end) return `Until ${fmt(end)}`;
  return null;
}

export default async function ParentHomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: parentLink } = await supabase
    .from("parent_auth")
    .select("parent_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!parentLink) redirect("/login");

  // Fetch all kids linked to this parent
  const { data: playerParents } = await supabase
    .from("player_parents")
    .select(`
      players(
        id, first_name, last_name, date_of_birth,
        roster(
          jersey_number, status,
          teams(id, name, sport, season, age_group, organization, season_start, season_end)
        )
      )
    `)
    .eq("parent_id", parentLink.parent_id);

  const players = (playerParents ?? [])
    .map((pp) => pp.players as any)
    .filter(Boolean);

  // Fetch primary photos for kids
  const playerIds = players.map((p: any) => p.id);
  const { data: photoRows } = playerIds.length
    ? await supabase
        .from("player_photos")
        .select("player_id, public_url")
        .eq("is_primary", true)
        .in("player_id", playerIds)
    : { data: [] };

  const primaryPhotos: Record<string, string> = {};
  for (const row of photoRows ?? []) {
    primaryPhotos[row.player_id] = row.public_url;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">My Kids</h1>

      {players.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          No players found. Contact your coach if this seems wrong.
        </p>
      ) : (
        <div className="space-y-6">
          {players.map((player: any) => {
            const photo = primaryPhotos[player.id];
            const activeRoster = (player.roster ?? []).filter((r: any) => r.status === "active");

            return (
              <div key={player.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {/* Player header */}
                <Link href={`/parent/player/${player.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  {photo ? (
                    <Image
                      src={photo}
                      alt={`${player.first_name} ${player.last_name}`}
                      width={56}
                      height={72}
                      className="w-14 h-[72px] object-cover rounded-xl border border-gray-200 dark:border-gray-700 shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-[72px] rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-300 dark:text-gray-600 text-2xl shrink-0">
                      👤
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {player.first_name} {player.last_name}
                    </p>
                    {player.date_of_birth && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {new Date(player.date_of_birth + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                      </p>
                    )}
                  </div>
                  <span className="ml-auto text-gray-400 dark:text-gray-500">→</span>
                </Link>

                {/* Active teams */}
                {activeRoster.length > 0 && (
                  <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                    {activeRoster.map((entry: any, i: number) => {
                      const t = entry.teams;
                      if (!t) return null;
                      const meta = [t.organization, t.sport, t.age_group, t.season].filter(Boolean).join(" · ");
                      const dateRange = formatDateRange(t.season_start, t.season_end);
                      return (
                        <div key={i} className="px-5 py-3 flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{t.name}</p>
                            {meta && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{meta}</p>}
                            {dateRange && <p className="text-xs text-gray-400 dark:text-gray-500">{dateRange}</p>}
                          </div>
                          {entry.jersey_number != null && (
                            <span className="text-sm font-mono text-gray-500 dark:text-gray-400 shrink-0">#{entry.jersey_number}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
