import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CardEditor, { type AssignTarget } from "@/app/_components/cardgen/CardEditor";
import { toAssignTargets } from "@/app/_components/cardgen/assign-targets";

// Parent Card Creator — only for parents the owner granted the card-creator
// tool. Builds a card from any photo and can assign it to one of their kids.
export default async function ParentCardCreatorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Link this user to their grant row (idempotent) and confirm the tool — don't
  // rely on the layout having linked first, since layout/page can fetch in parallel.
  const { data: granted } = await supabase.rpc("link_tool_access");
  const grantedKeys = (granted as string[] | null) ?? [];
  if (!grantedKeys.includes("card-creator")) redirect("/parent");

  // This parent's kids → assign targets.
  const { data: idRows } = await supabase.rpc("get_my_player_ids");
  const playerIds = ((idRows ?? []) as { player_id: string }[]).map((r) => r.player_id);

  let assignTargets: AssignTarget[] = [];
  if (playerIds.length > 0) {
    const [{ data: players }, { data: rosterRows }] = await Promise.all([
      supabase.from("players").select("id, first_name, last_name, date_of_birth").in("id", playerIds),
      supabase
        .from("roster")
        .select("player_id, status, jersey_number, teams(id, name, season, age_group)")
        .in("player_id", playerIds)
        .order("created_at", { ascending: false }),
    ]);
    assignTargets = toAssignTargets(
      players ?? [],
      (rosterRows ?? []) as unknown as Parameters<typeof toAssignTargets>[1]
    );
  }

  return (
    <div>
      <Link href="/parent" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← Back
      </Link>

      <div className="mt-3 mb-5">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Card Creator</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Build a card from any photo, then save it to your photos or to one of your kids.
        </p>
      </div>

      <CardEditor
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
        returnHref="/parent"
        assignTargets={assignTargets}
      />
    </div>
  );
}
