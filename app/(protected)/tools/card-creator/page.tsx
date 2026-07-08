import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CardDesign } from "@/lib/types";
import CardEditor, { type AssignTarget } from "@/app/_components/cardgen/CardEditor";
import { toAssignTargets } from "@/app/_components/cardgen/assign-targets";
import DraftsList, { type DraftRow } from "./DraftsList";

// Standalone card creator (Tools → Card Creator). Build a card from any photo
// without first picking a player; the finished card exports to the photo
// library / downloads, can be assigned to a player, or (owner) saved as a draft
// for a player that isn't assigned yet.
export default async function CardCreatorPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const { draft: draftId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Owner = owns at least one team; only the owner gets drafts.
  const { count: teamCount } = await supabase
    .from("teams")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  const isOwner = (teamCount ?? 0) > 0;

  // Players this user owns, with their current team — offered as assign targets.
  // (Scoped helpers own no players, so they get export-only.)
  const { data: players } = await supabase
    .from("players")
    .select("id, first_name, last_name, date_of_birth")
    .eq("user_id", user.id);

  let assignTargets: AssignTarget[] = [];
  const ids = (players ?? []).map((p) => p.id as string);
  if (ids.length > 0) {
    const { data: rosterRows } = await supabase
      .from("roster")
      .select("player_id, status, jersey_number, teams(id, name, season, age_group)")
      .in("player_id", ids)
      .order("created_at", { ascending: false });
    assignTargets = toAssignTargets(
      players ?? [],
      (rosterRows ?? []) as unknown as Parameters<typeof toAssignTargets>[1]
    );
  }

  // Names for earmarked drafts, keyed by player id (owner's own players).
  const nameById = new Map(
    (players ?? []).map((p) => [p.id as string, `${p.first_name} ${p.last_name}`.trim()])
  );

  // Reopen a draft (owner only). RLS scopes to this user. Try the assignment
  // columns first; fall back if the player_id/team_id migration isn't applied.
  let initialDesign: CardDesign | null = null;
  let initialAssignKey: string | undefined;
  if (isOwner && draftId) {
    const rich = await supabase
      .from("card_drafts")
      .select("card_design, player_id, team_id")
      .eq("id", draftId)
      .maybeSingle();
    const row = rich.error
      ? (await supabase.from("card_drafts").select("card_design").eq("id", draftId).maybeSingle()).data
      : rich.data;
    initialDesign = (row?.card_design as CardDesign | null) ?? null;
    const playerId = (row as { player_id?: string | null } | null)?.player_id ?? null;
    const teamId = (row as { team_id?: string | null } | null)?.team_id ?? null;
    if (playerId) initialAssignKey = `${playerId}::${teamId ?? "none"}`;
  }

  // The drafts list (graceful empty if the table isn't migrated yet; falls back
  // to the pre-assignment columns so existing drafts still show before migrate).
  let drafts: DraftRow[] = [];
  if (isOwner) {
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
    drafts = ((rows ?? []) as (DraftRow & { player_id?: string | null })[]).map((r) => ({
      ...r,
      player_name: r.player_id ? nameById.get(r.player_id) ?? null : null,
    }));
  }

  return (
    <div className="max-w-2xl">
      <Link href="/teams" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← Back
      </Link>

      <div className="mt-3 mb-5">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Card Creator</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Build a player card from any photo, then save it to your photos, assign it to a player
          {isOwner ? ", or save it as a draft for a player that isn't assigned yet" : ""}.
        </p>
      </div>

      <CardEditor
        key={draftId ?? "new"}
        standalone
        playerId={null}
        teamId={null}
        teamName=""
        ageGroup={null}
        season={null}
        firstName=""
        lastName=""
        jersey={null}
        playerAge={null}
        returnHref="/teams"
        assignTargets={assignTargets}
        allowDrafts={isOwner}
        draftId={draftId}
        initialDesign={initialDesign}
        initialAssignKey={initialAssignKey}
      />

      {isOwner && <DraftsList drafts={drafts} activeId={draftId ?? null} />}
    </div>
  );
}
