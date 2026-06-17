import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ImportJsonClient from "./ImportJsonClient";

export default async function ImportJsonPage() {
  const supabase = await createClient();
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, season")
    .order("season", { ascending: false })
    .order("name");

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link href="/players" className="text-sm text-blue-600 hover:underline">
          ← Back to players
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-3">Import / update from JSON</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Paste or upload a JSON list of player records (e.g. your league registration export). We&rsquo;ll
          match each one to your existing players, then let you review what gets created and confirm any
          changes that conflict with what you already have.
        </p>
      </div>

      <ImportJsonClient teams={(teams ?? []) as { id: string; name: string; season: string }[]} />
    </div>
  );
}
