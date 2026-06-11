import * as XLSX from "xlsx";
import { type ColumnMapping, type RowData, autoMapColumns } from "./fields";

export type ParsedSheet = {
  headers: string[];
  rows: RowData[];
  mapping: ColumnMapping;
};

// Parse a CSV or Excel file (client-side) into headers + row objects keyed by
// the original header strings. The first non-empty row is treated as headers.
export async function parseSheet(file: File): Promise<ParsedSheet> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [], mapping: {} };

  const sheet = workbook.Sheets[sheetName];
  // header:1 gives an array-of-arrays so we control header handling and keep
  // duplicate/blank headers from being silently merged.
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });

  if (matrix.length === 0) return { headers: [], rows: [], mapping: {} };

  const headers = (matrix[0] ?? []).map((h) => (h ?? "").toString().trim());

  const rows: RowData[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const cells = matrix[i] ?? [];
    const row: RowData = {};
    let hasValue = false;
    headers.forEach((header, c) => {
      const value = (cells[c] ?? "").toString().trim();
      if (value) hasValue = true;
      row[header] = value;
    });
    if (hasValue) rows.push(row);
  }

  return { headers, rows, mapping: autoMapColumns(headers) };
}
