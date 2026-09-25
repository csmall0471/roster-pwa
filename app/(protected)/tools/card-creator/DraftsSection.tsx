import { createClient } from "@/lib/supabase/server";
import DraftsList, { type DraftRow } from "./DraftsList";

// Streamed drafts list — fetched inside its own <Suspense> boundary so the Card
// Creator editor paints immediately and the drafts fill in with a spinner below,
// instead of the whole page blocking on this query. Owner-only data (RLS scopes
// card_drafts to the current user); renders nothing when there are no drafts.
export default async function DraftsSection({ activeId }: { activeId: string | null }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Names for earmarked drafts, keyed by player id (owner's own players).
  const { data: players } = await supabase
    .from("players")
    .select("id, first_name, last_name")
    .eq("user_id", user.id);
  const nameById = new Map(
    (players ?? []).map((p) => [p.id as string, `${p.first_name} ${p.last_name}`.trim()])
  );

  // Try the assignment column first; fall back if the player_id migration isn't
  // applied yet, so existing drafts still show.
  const rich = await supabase
    .from("card_drafts")
    .select("id, label, team_name, season, front_url, back_url, updated_at, player_id")
    .order("updated_at", { ascending: false });
  const rows = rich.error
    ? (
        await supabase
          .from("card_drafts")
          .select("id, label, team_name, season, front_url, back_url, updated_at")
          .order("updated_at", { ascending: false })
      ).data
    : rich.data;

  const drafts: DraftRow[] = ((rows ?? []) as (DraftRow & { player_id?: string | null })[]).map(
    (r) => ({
      ...r,
      player_name: r.player_id ? nameById.get(r.player_id) ?? null : null,
    })
  );

  return <DraftsList drafts={drafts} activeId={activeId} />;
}
