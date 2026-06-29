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

  // Reopen a draft (owner only). RLS scopes to this user.
  let initialDesign: CardDesign | null = null;
  if (isOwner && draftId) {
    const { data } = await supabase
      .from("card_drafts")
      .select("card_design")
      .eq("id", draftId)
      .maybeSingle();
    initialDesign = (data?.card_design as CardDesign | null) ?? null;
  }

  // The drafts list (graceful empty if the table isn't migrated yet).
  let drafts: DraftRow[] = [];
  if (isOwner) {
    const { data } = await supabase
      .from("card_drafts")
      .select("id, label, team_name, season, front_url, updated_at")
      .order("updated_at", { ascending: false });
    drafts = (data ?? []) as DraftRow[];
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
      />

      {isOwner && <DraftsList drafts={drafts} activeId={draftId ?? null} />}
    </div>
  );
}
