import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConfirmView from "./ConfirmView";

export default async function ConfirmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: season } = await supabase
    .from("tb_seasons")
    .select("id, name, status")
    .eq("id", id)
    .maybeSingle();
  if (!season) notFound();

  return (
    <div>
      <div className="mb-6">
        <Link href={`/tools/roster-creator/${id}`} className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800">
          ← {season.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Confirm coaches &amp; teams</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Claude reads every signup and cleans up the messy coach, team, and buddy entries
          automatically. You only need to settle the few things below that it wasn&rsquo;t sure about.
        </p>
      </div>

      <ConfirmView seasonId={id} autoRun={season.status !== "resolved"} />
    </div>
  );
}
