import * as XLSX from "xlsx";

// Parse the coach/teams workbook (client-side) into divisions + their teams.
// Convention: ONE SHEET PER DIVISION (sheet name = division name), ONE ROW PER
// TEAM. A row holding a person's name = a coached team; a "Team N" row = an open
// placeholder slot to be filled and named later. This file is the authoritative
// source of divisions, coaches, and the team COUNT per division.

export type ParsedRosterTeam = {
  rawLabel: string; // exactly what was typed (e.g. "Connor Small", "Team 14")
  coachName: string | null; // trimmed coach name, or null for a placeholder
  isPlaceholder: boolean;
};

export type ParsedRosterDivision = {
  name: string; // the sheet name, trimmed
  teams: ParsedRosterTeam[];
};

export type ParsedCoachRoster = {
  divisions: ParsedRosterDivision[];
};

// A bare "Team 14" / "team14" / "TEAM 3" row is an unassigned slot, not a coach.
const PLACEHOLDER_RE = /^team\s*\d+$/i;
// Defensive: skip a stray header row if someone added one.
const HEADER_WORDS = new Set(["coach", "coaches", "team", "teams", "name", "names"]);

function firstCell(row: unknown[]): string {
  for (const cell of row) {
    const v = (cell ?? "").toString().trim();
    if (v) return v;
  }
  return "";
}

export async function parseCoachWorkbook(file: File): Promise<ParsedCoachRoster> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", raw: false });

  const divisions: ParsedRosterDivision[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });

    const teams: ParsedRosterTeam[] = [];
    matrix.forEach((row, i) => {
      const label = firstCell(row ?? []);
      if (!label) return;
      // Drop a header word only if it's the very first row.
      if (i === 0 && HEADER_WORDS.has(label.toLowerCase())) return;
      const isPlaceholder = PLACEHOLDER_RE.test(label);
      teams.push({
        rawLabel: label,
        coachName: isPlaceholder ? null : label,
        isPlaceholder,
      });
    });

    if (teams.length > 0) divisions.push({ name: sheetName.trim(), teams });
  }

  return { divisions };
}
