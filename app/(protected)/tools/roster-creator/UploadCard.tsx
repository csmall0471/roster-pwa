"use client";

import { useRef, useState } from "react";
import ImportReview, { type SeasonOption } from "./ImportReview";
import { parseSheet, type ParsedSheet } from "./parse";

const ACCEPT = ".csv,.xlsx,.xls";
const ACCEPT_MIME = [
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

function isAccepted(file: File) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".csv") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    ACCEPT_MIME.includes(file.type)
  );
}

export default function UploadCard({ seasons }: { seasons: SeasonOption[] }) {
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [filename, setFilename] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    setError(null);
    const file = files?.[0];
    if (!file) return;
    if (!isAccepted(file)) {
      setError("Please upload a CSV or Excel file (.csv, .xlsx, .xls).");
      return;
    }
    setBusy(true);
    try {
      const sheet = await parseSheet(file);
      if (sheet.headers.length === 0 || sheet.rows.length === 0) {
        throw new Error("Couldn't find any data rows in that file.");
      }
      setFilename(file.name);
      setParsed(sheet);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong parsing the file.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  if (parsed) {
    return (
      <ImportReview
        parsed={parsed}
        seasons={seasons}
        defaultName={filename.replace(/\.[^.]+$/, "")}
        filename={filename}
        onCancel={() => {
          setParsed(null);
          setFilename("");
        }}
      />
    );
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) handleFiles(e.dataTransfer.files);
        }}
        onClick={() => !busy && inputRef.current?.click()}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          busy ? "cursor-wait opacity-70" : "cursor-pointer"
        } ${
          dragging
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
            : "border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 bg-white dark:bg-gray-900"
        }`}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-gray-400 mb-3" aria-hidden="true">
          <path d="M12 16V4m0 0L8 8m4-4l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {busy ? "Reading file…" : "Drag and drop a file here, or click to browse"}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">CSV or Excel (.csv, .xlsx, .xls)</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
