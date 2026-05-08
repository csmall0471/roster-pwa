import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import TeamPhotoBanner from "./_components/TeamPhotoBanner";

function formatDateRange(start: string | null, end: string | null) {
  const fmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  if (end) return `Until ${fmt(end)}`;
  return null;
}

type RosterEntry = {
  player_id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  status: string;
  photo_url: string | null;
};

function PlayerCard({
  entry,
  isMyKid,
}: {
  entry: RosterEntry;
  isMyKid: boolean;
}) {
  const name = `${entry.first_name} ${entry.last_name}`;
  const inner = (
    <div className={`relative rounded-xl overflow-hidden border ${isMyKid ? "border-blue-400 dark:border-blue-500" : "border-gray-200 dark:border-gray-700"}`}>
      <div className="relative aspect-[5/7] bg-gray-100 dark:bg-gray-800">
        {entry.photo_url ? (
          <Image
            src={entry.photo_url}
            alt={name}
            width={200}
            height={280}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-600 text-4xl">
            👤
          </div>
        )}
        {isMyKid && (
          <span className="absolute top-2 left-2 bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            MY KID
          </span>
        )}
        {entry.jersey_number != null && (
          <span className="absolute top-2 right-2 bg-black/50 text-white text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full">
            #{entry.jersey_number}
          </span>
        )}
      </div>
      <div className="px-2 py-1.5">
        <p className={`text-xs font-medium truncate ${isMyKid ? "text-blue-600 dark:text-blue-400" : "text-gray-900 dark:text-white"}`}>
          {name}
        </p>
      </div>
    </div>
  );

  if (isMyKid) {
    return (
      <Link href={`/parent/player/${entry.player_id}`} className="block hover:opacity-90 transition-opacity">
        {inner}
      </Link>
    );
  }
  return inner;
}

export default async function ParentTeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: parentLink } = await supabase
    .from("parent_auth")
    .select("parent_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!parentLink) redirect("/login");

  const { data: ppRows } = await supabase.rpc("get_my_player_ids");
  const myKidIds = new Set((ppRows ?? []).map((r: { player_id: string }) => r.player_id));

  const [{ data: team }, { data: teamMedia }] = await Promise.all([
    supabase.from("teams").select("*").eq("id", id).maybeSingle(),
    supabase.from("team_media").select("public_url, is_team_photo").eq("team_id", id),
  ]);
  if (!team) notFound();

  const teamPhotoUrl = (teamMedia ?? []).find((m) => m.is_team_photo)?.public_url ?? null;

  // Query roster directly — RLS policy (parents_read_roster) allows this
  // for all entries on teams where the parent has a kid.
  const { data: rosterRows } = await supabase
    .from("roster")
    .select("player_id, jersey_number, status, players(first_name, last_name)")
    .eq("team_id", id)
    .order("status", { ascending: false });

  // Fetch each player's card for this specific team/season
  const allPlayerIds = (rosterRows ?? []).map((r) => r.player_id as string);
  const { data: photoRows } = allPlayerIds.length > 0
    ? await supabase
        .from("player_photos")
        .select("player_id, public_url")
        .in("player_id", allPlayerIds)
        .eq("team_id", id)
    : { data: null };
  // Fall back to primary photo for any player without a season-specific card
  const { data: primaryPhotoRows } = allPlayerIds.length > 0
    ? await supabase
        .from("player_photos")
        .select("player_id, public_url")
        .in("player_id", allPlayerIds)
        .eq("is_primary", true)
    : { data: null };
  const primaryMap = new Map(
    (primaryPhotoRows ?? []).map((p) => [p.player_id as string, p.public_url as string])
  );
  const photoMap = new Map(
    (photoRows ?? []).map((p) => [p.player_id as string, p.public_url as string])
  );
  // Merge: season-specific card takes priority, fall back to primary
  for (const [pid, url] of primaryMap) {
    if (!photoMap.has(pid)) photoMap.set(pid, url);
  }

  const rosterList: RosterEntry[] = (rosterRows ?? []).map((row) => {
    const player = row.players as unknown as { first_name: string; last_name: string } | null;
    return {
      player_id: row.player_id as string,
      first_name: player?.first_name ?? "",
      last_name: player?.last_name ?? "",
      jersey_number: (row.jersey_number as number | null) ?? null,
      status: row.status as string,
      photo_url: photoMap.get(row.player_id as string) ?? null,
    };
  });

  const active = rosterList.filter((r) => r.status === "active");
  const inactive = rosterList.filter((r) => r.status === "inactive");

  const meta = [team.organization, team.sport, team.age_group, team.season]
    .filter(Boolean).join(" · ");
  const dateRange = formatDateRange(team.season_start, team.season_end);

  return (
    <div>
      <Link href="/parent" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← My Kids
      </Link>

      {teamPhotoUrl && (
        <TeamPhotoBanner src={teamPhotoUrl} alt={`${team.name} team photo`} />
      )}

      <div className="mt-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{team.name}</h1>
        {meta && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{meta}</p>}
        {dateRange && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{dateRange}</p>}

        {(team.mojo_code || team.snack_signup_url) && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {team.snack_signup_url && (
              <a
                href={team.snack_signup_url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-green-300 dark:border-green-700 px-3 py-1.5 text-sm font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950 transition-colors"
              >
                Snack signup →
              </a>
            )}
            {team.mojo_code && (
              <a
                href={`https://get.mojo.sport/team-invite?code=${team.mojo_code}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-orange-300 dark:border-orange-700 px-3 py-1.5 text-sm font-medium text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950 transition-colors"
              >
                Join on Mojo →
              </a>
            )}
          </div>
        )}
      </div>

      <section>
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
          Roster ({active.length})
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {active.map((entry) => (
            <PlayerCard key={entry.player_id} entry={entry} isMyKid={myKidIds.has(entry.player_id)} />
          ))}
        </div>
      </section>

      {inactive.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
            Inactive
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 opacity-50">
            {inactive.map((entry) => (
              <PlayerCard key={entry.player_id} entry={entry} isMyKid={myKidIds.has(entry.player_id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
