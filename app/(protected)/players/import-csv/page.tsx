import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ImportCsvClient from "./ImportCsvClient";

export default async function ImportCsvPage() {
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
        <h1 className="mt-3 text-2xl font-bold text-gray-900 dark:text-white">Import / update from CSV</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Upload your league roster export (like the registration CSV). We match each row to an existing
          player by their registration <span className="font-mono">id</span> — or by name — then let you
          review what gets created and updated before anything changes. Existing values are only overwritten
          when the file has a new value; blanks never wipe out what you have.
        </p>
        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
          Reads: name, birth date, gender, address (street / city / state / zip), jersey number, and up to two
          parents (deduplicated by phone/email). Optionally drops everyone onto a team&apos;s roster.
        </p>
      </div>

      <ImportCsvClient teams={(teams ?? []) as { id: string; name: string; season: string | null }[]} />
    </div>
  );
}
