import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PlayerForm from "../../_components/PlayerForm";
import { updatePlayer } from "../../actions";
import type { Parent } from "@/lib/types";

export default async function EditPlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("players")
    .select(
      `*, player_parents(relationship, parents(id, first_name, last_name, email, phone))`
    )
    .eq("id", id)
    .single();

  if (!data) notFound();

  const playerData = {
    first_name: data.first_name,
    last_name: data.last_name,
    date_of_birth: data.date_of_birth ?? null,
    grade: data.grade ?? null,
    shirt_size: data.shirt_size ?? null,
    notes: data.notes ?? null,
    parents: (
      data.player_parents as Array<{
        relationship: string;
        parents: Pick<Parent, "id" | "first_name" | "last_name" | "email" | "phone">;
      }>
    ).map((pp) => pp.parents),
  };

  const updateWithId = updatePlayer.bind(null, id);

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <Link href="/players" className="text-sm text-blue-600 hover:underline">
          ← Back to players
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-3">
          Edit {data.first_name} {data.last_name}
        </h1>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <PlayerForm player={playerData} action={updateWithId} />
      </div>
    </div>
  );
}
