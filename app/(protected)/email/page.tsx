import { createClient } from "@/lib/supabase/server";
import EmailHub from "./_components/EmailHub";

export default async function EmailPage() {
  const supabase = await createClient();

  const [{ data: teams }, { data: interestRows }, { data: listRows }] = await Promise.all([
    supabase
      .from("teams")
      .select(`
        id, name, organization, sport, season, season_start,
        roster(
          players(
            id, first_name, last_name,
            player_parents(
              parents(id, first_name, last_name, email, phone)
            )
          )
        )
      `)
      .order("season_start", { ascending: false }),
    supabase
      .from("interest_lists")
      .select("*")
      .order("last_name")
      .order("first_name"),
    // Pre-067 this table doesn't exist; the query just errors → empty list and
    // the tab's actions explain what's missing.
    supabase.from("interest_list_groups").select("*").order("name"),
  ]);

  // Contact info for roster players that appear in interest lists: their
  // parents, resolved live (a player entry carries no email of its own). Keyed
  // by player id. Queried directly (not from the teams join) so players who
  // aren't on any current team still resolve.
  const playerIds = [
    ...new Set(
      (interestRows ?? [])
        .map((r) => r.player_id as string | null)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const playerContacts: Record<string, PlayerContact> = {};
  if (playerIds.length > 0) {
    const { data: playerRows } = await supabase
      .from("players")
      .select("id, first_name, last_name, player_parents(parents(id, first_name, last_name, email, phone))")
      .in("id", playerIds);
    type Par = { id: string; first_name: string; last_name: string; email: string | null; phone: string | null };
    type Row = { id: string; first_name: string; last_name: string; player_parents: { parents: Par | Par[] | null }[] };
    for (const row of (playerRows ?? []) as unknown as Row[]) {
      const parents: Par[] = [];
      for (const pp of row.player_parents ?? []) {
        const embedded = Array.isArray(pp.parents) ? pp.parents : pp.parents ? [pp.parents] : [];
        for (const par of embedded) {
          if (par && !parents.some((x) => x.id === par.id)) parents.push(par);
        }
      }
      playerContacts[row.id] = {
        name: `${row.first_name} ${row.last_name}`.trim(),
        parents: parents.map((p) => ({
          id: p.id,
          name: `${p.first_name} ${p.last_name}`.trim(),
          email: p.email,
          phone: p.phone,
        })),
      };
    }
  }

  return (
    <EmailHub
      teams={(teams ?? []) as unknown as TeamWithRoster[]}
      interestEntries={(interestRows ?? []) as InterestEntry[]}
      interestLists={(listRows ?? []) as InterestList[]}
      playerContacts={playerContacts}
    />
  );
}

export type TeamWithRoster = {
  id: string;
  name: string;
  organization: string | null;
  sport: string | null;
  season: string | null;
  season_start: string | null;
  roster: {
    players: {
      id: string;
      first_name: string;
      last_name: string;
      player_parents: {
        parents: { id: string; first_name: string; last_name: string; email: string | null; phone: string | null } | null;
      }[];
    } | null;
  }[];
};

export type InterestList = {
  id: string;
  name: string;
  sport: string | null;
  created_at: string;
};

export type InterestEntry = {
  id: string;
  sport: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
  list_id?: string | null;
  player_id?: string | null;
};

export type PlayerContact = {
  name: string;
  parents: { id: string; name: string; email: string | null; phone: string | null }[];
};
