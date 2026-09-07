import { createClient } from "@/lib/supabase/server";

// Export every player the coach owns as a CSV in the league-registration format
// — the same columns the /players/import-csv importer reads, so an export can be
// edited in a spreadsheet and re-imported. RLS scopes the query to this user.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = [
  "id", "team", "season_id", "season", "sport",
  "player_first_name", "player_last_name", "gender", "birth_date", "age_group",
  "position", "number", "Hand",
  "parent1_email", "parent1_first_name", "parent1_last_name", "parent1_mobile_number",
  "parent2_email", "parent2_first_name", "parent2_last_name", "parent2_mobile_number",
  "street", "city", "state", "zip",
];

// RFC-4180 field: quote when it holds a comma, quote, or newline; double inner quotes.
function esc(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

type ParentRow = { first_name: string | null; last_name: string | null; email: string | null; phone: string | null };
type RosterRow = {
  status: string | null;
  jersey_number: number | null;
  teams: { name: string | null; season: string | null; sport: string | null; age_group: string | null } | null;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data, error } = await supabase
    .from("players")
    .select(
      `external_id, first_name, last_name, gender, date_of_birth, street, city, state, zip,
       player_parents(parents(first_name, last_name, email, phone)),
       roster(status, jersey_number, teams(name, season, sport, age_group))`
    )
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) return new Response(`Export failed: ${error.message}`, { status: 500 });

  const rows: string[] = [HEADERS.join(",")];
  for (const p of (data ?? []) as unknown as Array<Record<string, unknown>>) {
    const parents = ((p.player_parents as Array<{ parents: ParentRow | null }> | null) ?? [])
      .map((pp) => pp.parents)
      .filter((x): x is ParentRow => !!x);

    // One row per player: use their active team (else the first one they're on).
    const roster = (p.roster as RosterRow[] | null) ?? [];
    const chosen =
      roster.find((r) => r.status === "active" && r.teams) ?? roster.find((r) => r.teams) ?? null;
    const team = chosen?.teams ?? null;

    const [p1, p2] = parents;
    rows.push(
      [
        p.external_id, team?.name, "", team?.season, team?.sport,
        p.first_name, p.last_name, p.gender, p.date_of_birth, team?.age_group,
        "", chosen?.jersey_number, "",
        p1?.email, p1?.first_name, p1?.last_name, p1?.phone,
        p2?.email, p2?.first_name, p2?.last_name, p2?.phone,
        p.street, p.city, p.state, p.zip,
      ]
        .map(esc)
        .join(",")
    );
  }

  // BOM so Excel reads UTF-8; CRLF line endings per RFC-4180.
  const csv = "\uFEFF" + rows.join("\r\n") + "\r\n";
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="players-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
