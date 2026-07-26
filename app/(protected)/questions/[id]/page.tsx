import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Question, QuestionSetStatus } from "@/lib/types";
import QuestionSetView, {
  type BoardGuardian,
  type BoardTeam,
  type PickerTeam,
} from "./_components/QuestionSetView";

export const dynamic = "force-dynamic";

export default async function QuestionSetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: set } = await supabase
    .from("question_sets")
    .select("id, title, description, status, message_template")
    .eq("id", id)
    .maybeSingle();
  if (!set) notFound();

  const [{ data: questionRows }, { data: targetRows }, { data: allTeams }] =
    await Promise.all([
      supabase
        .from("questions")
        .select("id, set_id, user_id, prompt, help_text, answer_type, options, position, created_at")
        .eq("set_id", id)
        .order("position", { ascending: true }),
      supabase
        .from("question_set_teams")
        .select("team_id, teams(id, name, season, age_group, season_start)")
        .eq("set_id", id),
      supabase
        .from("teams")
        .select("id, name, season, age_group, season_start")
        .order("season_start", { ascending: false })
        .order("name", { ascending: true }),
    ]);

  const questions = (questionRows ?? []) as Question[];

  // Targeted teams (in a stable, human order), then their rosters.
  type TeamMeta = { id: string; name: string; season: string | null; age_group: string | null; season_start: string | null };
  const targetedTeams: TeamMeta[] = (targetRows ?? [])
    .map((r) => (r as unknown as { teams: TeamMeta | null }).teams)
    .filter((t): t is TeamMeta => !!t)
    .sort((a, b) => {
      const s = (b.season_start ?? "").localeCompare(a.season_start ?? "");
      return s !== 0 ? s : a.name.localeCompare(b.name);
    });
  const targetTeamIds = targetedTeams.map((t) => t.id);

  const teamLabel = (t: TeamMeta) =>
    [t.name, t.age_group, t.season].filter(Boolean).join(" · ");

  // Roster kids for the targeted teams.
  const teams: BoardTeam[] = [];
  const questionIds = questions.map((q) => q.id);
  if (targetTeamIds.length > 0) {
    const { data: rosterRows } = await supabase
      .from("roster")
      .select("player_id, jersey_number, team_id, status, players(first_name, last_name)")
      .in("team_id", targetTeamIds);

    const byTeam = new Map<string, BoardTeam>();
    for (const t of targetedTeams) {
      byTeam.set(t.id, { id: t.id, label: teamLabel(t), players: [] });
    }
    for (const r of rosterRows ?? []) {
      const row = r as unknown as {
        player_id: string;
        jersey_number: string | null;
        team_id: string;
        status: string | null;
        players: { first_name: string; last_name: string } | null;
      };
      const t = byTeam.get(row.team_id);
      if (!t || !row.players) continue;
      t.players.push({
        id: row.player_id,
        name: `${row.players.first_name} ${row.players.last_name}`.trim(),
        jersey: row.jersey_number,
        guardians: [],
      });
    }
    // Keep the targeted-team order; sort kids by jersey (numeric) then name.
    for (const t of targetedTeams) {
      const bt = byTeam.get(t.id)!;
      const jerseyNum = (j: string | null) => {
        const n = j != null && j !== "" ? Number(j) : NaN;
        return Number.isNaN(n) ? Infinity : n; // blanks / non-numeric sort last
      };
      bt.players.sort((a, b) => {
        const ja = jerseyNum(a.jersey);
        const jb = jerseyNum(b.jersey);
        if (ja !== jb) return ja - jb;
        return a.name.localeCompare(b.name);
      });
      teams.push(bt);
    }

    // Guardians (with phones) for those kids — powers the "Text parents" button.
    // The coach can read player_parents(parents(…)) for their own players (same
    // path the players page uses).
    const allPlayerIds = [...new Set(teams.flatMap((t) => t.players.map((p) => p.id)))];
    if (allPlayerIds.length > 0) {
      type ParentRow = { first_name: string | null; last_name: string | null; phone: string | null };
      type GRow = { id: string; player_parents: { parents: ParentRow | ParentRow[] | null }[] | null };
      const { data: gRows } = await supabase
        .from("players")
        .select("id, player_parents(parents(first_name, last_name, phone))")
        .in("id", allPlayerIds);

      const byPlayer = new Map<string, BoardGuardian[]>();
      for (const row of (gRows ?? []) as unknown as GRow[]) {
        const guardians: BoardGuardian[] = [];
        for (const pp of row.player_parents ?? []) {
          const pr = Array.isArray(pp.parents) ? pp.parents[0] : pp.parents;
          if (!pr) continue;
          guardians.push({
            name: `${pr.first_name ?? ""} ${pr.last_name ?? ""}`.trim(),
            phone: pr.phone ?? null,
          });
        }
        byPlayer.set(row.id, guardians);
      }
      for (const t of teams) for (const p of t.players) p.guardians = byPlayer.get(p.id) ?? [];
    }
  }

  // Answers for this set's questions.
  let initialAnswers: { questionId: string; playerId: string; value: string }[] = [];
  if (questionIds.length > 0) {
    const { data: answerRows } = await supabase
      .from("question_answers")
      .select("question_id, player_id, value")
      .in("question_id", questionIds);
    initialAnswers = (answerRows ?? []).map((a) => ({
      questionId: a.question_id as string,
      playerId: a.player_id as string,
      value: (a.value as string | null) ?? "",
    }));
  }

  const pickerTeams: PickerTeam[] = (allTeams ?? []).map((t) => ({
    id: t.id as string,
    label: teamLabel(t as TeamMeta),
  }));

  return (
    <div>
      <Link href="/questions" className="text-sm text-gray-500 hover:text-gray-700">
        ← Questions
      </Link>
      <QuestionSetView
        setId={set.id as string}
        initialTitle={set.title as string}
        initialDescription={(set.description as string | null) ?? ""}
        initialStatus={set.status as QuestionSetStatus}
        initialMessageTemplate={(set.message_template as string | null) ?? ""}
        allTeams={pickerTeams}
        targetTeamIds={targetTeamIds}
        teams={teams}
        questions={questions}
        initialAnswers={initialAnswers}
      />
    </div>
  );
}
