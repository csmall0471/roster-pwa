import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Stepper from "../../Stepper";
import StructureEditor, { type EditorDivision } from "./StructureEditor";

export default async function SetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: season } = await supabase
    .from("tb_seasons")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!season) notFound();

  const [{ data: divisions }, { data: teams }, { data: coaches }, { data: assists }] = await Promise.all([
    supabase.from("tb_divisions").select("id, name, position").eq("season_id", id).order("position"),
    supabase
      .from("tb_teams")
      .select("id, division_id, name, coach_id, is_placeholder, practice_night, position")
      .eq("season_id", id)
      .order("position"),
    supabase.from("tb_coaches").select("id, name").eq("season_id", id),
    supabase.from("tb_team_coaches").select("team_id, coach_id").eq("season_id", id),
  ]);

  const coachName = new Map((coaches ?? []).map((c) => [c.id as string, c.name as string]));
  const assistantsByTeam = new Map<string, { id: string; name: string }[]>();
  for (const a of assists ?? []) {
    const tid = a.team_id as string;
    if (!assistantsByTeam.has(tid)) assistantsByTeam.set(tid, []);
    assistantsByTeam.get(tid)!.push({ id: a.coach_id as string, name: coachName.get(a.coach_id as string) ?? "" });
  }
  const editorDivisions: EditorDivision[] = (divisions ?? []).map((d) => ({
    id: d.id as string,
    name: d.name as string,
    teams: (teams ?? [])
      .filter((t) => t.division_id === d.id)
      .map((t) => ({
        id: t.id as string,
        coachName: t.coach_id ? coachName.get(t.coach_id as string) ?? "" : "",
        isPlaceholder: !!t.is_placeholder,
        night: (t.practice_night as string | null) ?? null,
        assistants: assistantsByTeam.get(t.id as string) ?? [],
      })),
  }));

  return (
    <div>
      <div className="mb-4">
        <Link
          href={`/tools/roster-creator/${id}`}
          className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800"
        >
          ← {season.name}
        </Link>
      </div>
      <Stepper seasonId={id} current="setup" />
      <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Structure</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
        Set up your divisions, coaches &amp; teams, and practice days. Upload a coaches workbook to
        populate it fast, then add, edit, or remove anything by hand.
      </p>
      <StructureEditor seasonId={id} divisions={editorDivisions} />
    </div>
  );
}
