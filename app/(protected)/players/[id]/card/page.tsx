import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { CardDesign } from "@/lib/types";
import CardEditor from "@/app/_components/cardgen/CardEditor";

type SeasonRow = {
  status: string;
  teams: {
    id: string;
    name: string;
    season: string | null;
    age_group: string | null;
    season_start: string | null;
  } | null;
};

export default async function PlayerCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ team?: string }>;
}) {
  const { id } = await params;
  const { team: teamIdParam } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: player } = await supabase
    .from("players")
    .select("id, first_name, last_name, date_of_birth")
    .eq("id", id)
    .single();
  if (!player) notFound();

  const { data: seasonsRaw } = await supabase
    .from("roster")
    .select("status, team_id, jersey_number, teams(id, name, season, age_group, season_start)")
    .eq("player_id", id)
    .order("created_at", { ascending: false });
  const seasons = (seasonsRaw ?? []) as unknown as (SeasonRow & {
    team_id: string;
    jersey_number: number | null;
  })[];

  let teamId: string | null = null;
  let teamName = "";
  let season: string | null = null;
  let ageGroup: string | null = null;
  let jersey: string | null = null;
  if (teamIdParam) {
    const match = seasons.find((s) => s.teams?.id === teamIdParam);
    if (match?.teams) {
      teamId = match.teams.id;
      teamName = match.teams.name;
      season = match.teams.season ?? null;
      ageGroup = match.teams.age_group ?? null;
      jersey = match.jersey_number != null ? String(match.jersey_number) : null;
    }
  }
  if (!teamId) {
    const active =
      seasons.find((s) => s.status === "active" && s.teams) ?? seasons.find((s) => s.teams);
    if (active?.teams) {
      teamId = active.teams.id;
      teamName = active.teams.name;
      season = active.teams.season ?? null;
      ageGroup = active.teams.age_group ?? null;
      jersey = active.jersey_number != null ? String(active.jersey_number) : null;
    }
  }

  let playerAge: string | null = null;
  if (player.date_of_birth) {
    const birth = new Date(player.date_of_birth + "T00:00:00");
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    playerAge = String(age);
  }

  let initialDesign: CardDesign | null = null;
  if (teamId) {
    const { data: existing } = await supabase
      .from("player_photos")
      .select("card_design")
      .eq("player_id", id)
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .not("card_design", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    initialDesign = (existing?.card_design as CardDesign | null) ?? null;
  }

  const returnHref = teamId ? `/teams/${teamId}` : `/players/${id}`;

  return (
    <div className="max-w-2xl">
      <Link
        href={returnHref}
        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
      >
        ← Back
      </Link>

      <div className="mt-3 mb-5">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Create card for {player.first_name}
        </h1>
        {teamName && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {teamName}
            {season ? ` · ${season}` : ""}
          </p>
        )}
      </div>

      {!teamId ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Add this player to a team first.
        </p>
      ) : (
        <CardEditor
          playerId={id}
          teamId={teamId}
          teamName={teamName}
          ageGroup={ageGroup}
          season={season}
          firstName={player.first_name}
          lastName={player.last_name}
          jersey={jersey}
          playerAge={playerAge}
          returnHref={returnHref}
          initialDesign={initialDesign}
        />
      )}
    </div>
  );
}
