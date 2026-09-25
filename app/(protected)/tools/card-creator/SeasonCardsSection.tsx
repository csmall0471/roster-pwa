import { createClient } from "@/lib/supabase/server";
import SeasonCardsSaver, { type SeasonGroup } from "./SeasonCardsSaver";

// Streamed "save all season cards" tool — fetched inside its own <Suspense> so
// its (potentially heavy) scan of every in-progress-season card doesn't block
// the editor's first paint. "In progress" = the season is currently active
// (started, not ended). Cards live on player_photos, scoped by team.
export default async function SeasonCardsSection() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const today = new Date().toISOString().slice(0, 10);
  const { data: teamRows } = await supabase
    .from("teams")
    .select("id, name, season, season_start, season_end")
    .eq("user_id", user.id);
  const current = (teamRows ?? []).filter((t) => {
    const start = t.season_start as string | null;
    const end = t.season_end as string | null;
    if (end && end < today) return false; // already finished
    if (start && start > today) return false; // not started yet
    return true; // in progress
  });
  const currentIds = current.map((t) => t.id as string);
  if (currentIds.length === 0) return <SeasonCardsSaver seasons={[]} />;

  const { data: cardRows } = await supabase
    .from("player_photos")
    .select("public_url, back_public_url, team_id, players(first_name, last_name)")
    .in("team_id", currentIds)
    .order("created_at", { ascending: false });

  const byTeam = new Map<string, SeasonGroup>();
  for (const t of current) {
    byTeam.set(t.id as string, {
      teamId: t.id as string,
      teamName: (t.name as string) || "Team",
      season: (t.season as string | null) ?? null,
      cards: [],
    });
  }
  for (const row of cardRows ?? []) {
    const group = byTeam.get(row.team_id as string);
    if (!group) continue;
    const p = row.players as unknown as { first_name: string; last_name: string } | null;
    const who = p ? `${p.first_name} ${p.last_name}`.trim() : "";
    group.cards.push({
      front: row.public_url as string,
      back: (row.back_public_url as string | null) ?? null,
      name: who || "card",
    });
  }
  const inProgressSeasons = [...byTeam.values()].filter((g) => g.cards.length > 0);

  return <SeasonCardsSaver seasons={inProgressSeasons} />;
}
