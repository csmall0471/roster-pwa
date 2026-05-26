import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TeamPhotoBanner from "./_components/TeamPhotoBanner";
import TeamTabs, { type RosterEntry } from "./_components/TeamTabs";
import type { SnackGameRow } from "./_components/SnackSchedule";

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

export default async function ParentTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const initialTab = (await searchParams).tab ?? "roster";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: parentLink } = await supabase
    .from("parent_auth")
    .select("parent_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!parentLink) redirect("/login");
  const parentId = parentLink.parent_id;

  const { data: ppRows } = await supabase.rpc("get_my_player_ids");
  const myKidIds = (ppRows ?? []).map((r: { player_id: string }) => r.player_id);
  const myKidSet = new Set(myKidIds);

  const [{ data: team }, { data: teamMedia }, { data: gamesRaw }] = await Promise.all([
    supabase.from("teams").select("*").eq("id", id).maybeSingle(),
    supabase.from("team_media").select("public_url, is_team_photo").eq("team_id", id),
    supabase
      .from("games")
      .select(`id, game_date, game_time, opponent, location, is_home, notes, event_type, title,
               snack_signups(id, parent_id, slot_number, reminder_email, reminder_sms,
                             parents(first_name, last_name))`)
      .eq("team_id", id)
      .order("game_date", { ascending: true }),
  ]);
  if (!team) notFound();

  const teamPhotoUrl = (teamMedia ?? []).find((m) => m.is_team_photo)?.public_url ?? null;

  // Fetch full team roster — parents_read_team_roster policy covers all players on the team
  const { data: rosterRows } = await supabase
    .from("roster")
    .select("player_id, jersey_number, status, players(first_name, last_name)")
    .eq("team_id", id)
    .order("status", { ascending: false });

  const allPlayerIds = (rosterRows ?? []).map((r) => r.player_id as string);
  const { data: photoRows } = allPlayerIds.length > 0
    ? await supabase
        .from("player_photos")
        .select("player_id, public_url")
        .in("player_id", allPlayerIds)
        .eq("team_id", id)
    : { data: null };
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

  const games = (gamesRaw ?? []).map((g) => ({
    ...g,
    event_type: (g as any).event_type ?? "game",
    title: (g as any).title ?? null,
    signups: (g as any).snack_signups ?? [],
  })) as SnackGameRow[];

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

        {(team.mojo_code || (team.snack_signup_url && !team.snack_signup_enabled)) && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {team.snack_signup_url && !team.snack_signup_enabled && (
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

      <TeamTabs
        teamId={id}
        initialTab={initialTab}
        active={active}
        inactive={inactive}
        myKidIds={myKidIds}
        games={games}
        slotsPerGame={team.snack_slots_per_game ?? 1}
        parentId={parentId}
        teamName={team.name}
        snackEnabled={team.snack_signup_enabled ?? false}
      />
    </div>
  );
}
