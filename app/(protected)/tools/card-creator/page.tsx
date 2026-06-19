import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CardEditor, { type AssignTarget } from "@/app/_components/cardgen/CardEditor";
import { toAssignTargets } from "@/app/_components/cardgen/assign-targets";

// Standalone card creator (Tools → Card Creator). Build a card from any photo
// without first picking a player; the finished card exports to the photo
// library / downloads, or can be assigned to one of the owner's players.
export default async function CardCreatorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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

  return (
    <div className="max-w-2xl">
      <Link
        href="/teams"
        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
      >
        ← Back
      </Link>

      <div className="mt-3 mb-5">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Card Creator
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Build a player card from any photo, then save it to your photos or assign it to a player.
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
        returnHref="/teams"
        assignTargets={assignTargets}
      />
    </div>
  );
}
