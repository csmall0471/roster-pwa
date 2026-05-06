import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TeamForm from "../../_components/TeamForm";
import { updateTeam } from "../../actions";
import type { Team } from "@/lib/types";

export default async function EditTeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: team } = await supabase
    .from("teams")
    .select("*")
    .eq("id", id)
    .single();

  if (!team) notFound();

  const updateWithId = updateTeam.bind(null, id);

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <Link href="/teams" className="text-sm text-blue-600 hover:underline">
          ← Back to teams
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-3">Edit team</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <TeamForm team={team as Team} action={updateWithId} />
      </div>
    </div>
  );
}
