import { createClient } from "@/lib/supabase/server";
import EmailHub from "./_components/EmailHub";

export default async function EmailPage() {
  const supabase = await createClient();

  const [{ data: teams }, { data: interestRows }] = await Promise.all([
    supabase
      .from("teams")
      .select(`
        id, name, organization, sport, season, season_start,
        roster(
          players(
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
      .order("sport")
      .order("last_name")
      .order("first_name"),
  ]);

  return (
    <EmailHub
      teams={(teams ?? []) as unknown as TeamWithRoster[]}
      interestEntries={(interestRows ?? []) as InterestEntry[]}
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
      player_parents: {
        parents: { id: string; first_name: string; last_name: string; email: string | null; phone: string | null } | null;
      }[];
    } | null;
  }[];
};

export type InterestEntry = {
  id: string;
  sport: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
};
