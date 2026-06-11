import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { type CanonicalRecord, FIELD_DEFS } from "../../fields";
import { buildProposal, type PlayerInput } from "../../resolve/engine";
import { selectAll } from "../../db";
import ResolveReview from "./ResolveReview";

export default async function ResolvePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: season } = await supabase
    .from("tb_seasons")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!season) notFound();

  const players = await selectAll((from, to) =>
    supabase
      .from("tb_players")
      .select(
        "id, first_name, last_name, gender, age_group, package_name, school, coach_first, coach_last, team_name, buddy_first, buddy_last, practice_nights"
      )
      .eq("season_id", id)
      .order("id")
      .range(from, to)
  );

  const inputs: PlayerInput[] = players.map((p) => {
    const record = {} as CanonicalRecord;
    for (const f of FIELD_DEFS) {
      record[f.key] = ((p as Record<string, unknown>)[f.key] as string) ?? "";
    }
    return { id: p.id as string, record };
  });

  const proposal = buildProposal(inputs);

  return (
    <div>
      <div className="mb-6">
        <Link
          href={`/tools/roster-creator/${id}`}
          className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800"
        >
          ← {season.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Resolve requests</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Fuzzy matching grouped the messy free-text entries. Confirm the groupings below —
          anything flagged for review was a borderline match. Applying saves the canonical
          coaches, team names, and buddy links that grouping will use.
        </p>
      </div>

      <ResolveReview seasonId={id} proposal={proposal} playerCount={inputs.length} />
    </div>
  );
}
