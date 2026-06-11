"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSeason } from "./actions";

const SEASONS = [
  { key: "fall", emoji: "🍂", label: "Fall" },
  { key: "winter", emoji: "❄️", label: "Winter" },
  { key: "spring", emoji: "🌸", label: "Spring" },
  { key: "summer", emoji: "☀️", label: "Summer" },
];

const SPORTS = [
  { key: "football", emoji: "🏈", label: "Football" },
  { key: "basketball", emoji: "🏀", label: "Basketball" },
  { key: "soccer", emoji: "⚽", label: "Soccer" },
];

const THIS_YEAR = new Date().getFullYear();
const YEARS = [THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1, THIS_YEAR + 2].map(String);

// Creates a blank season and drops the user into the structure editor (step 1).
export default function NewSeasonButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [seasonKey, setSeasonKey] = useState<string>(""); // fall | winter | spring | summer | other
  const [customSeason, setCustomSeason] = useState("");
  const [year, setYear] = useState<string>("");
  const [sportKey, setSportKey] = useState<string>(""); // football | basketball | soccer | other
  const [customSport, setCustomSport] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function seasonLabel(): string {
    if (seasonKey === "other") return customSeason.trim();
    const s = SEASONS.find((x) => x.key === seasonKey);
    return s ? `${s.emoji} ${s.label}` : "";
  }
  function composedName(): string {
    return [seasonLabel(), year].filter(Boolean).join(" ").trim();
  }
  function sportValue(): string {
    if (sportKey === "other") return customSport.trim();
    const s = SPORTS.find((x) => x.key === sportKey);
    return s ? `${s.emoji} ${s.label}` : "";
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const id = await createSeason(composedName() || "Untitled season", sportValue());
      router.push(`/tools/roster-creator/${id}/setup`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create season.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
      >
        <span className="text-base leading-none">+</span> New season
      </button>
    );
  }

  const chip = (selected: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
      selected
        ? "border-blue-600 bg-blue-600 text-white"
        : "border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-700 dark:text-gray-200 hover:border-gray-400"
    }`;

  const preview = composedName();

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
      <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">New season</p>

      <div className="space-y-3">
        {/* Season */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Season</span>
          <div className="flex flex-wrap gap-2">
            {SEASONS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSeasonKey((k) => (k === s.key ? "" : s.key))}
                className={chip(seasonKey === s.key)}
              >
                <span className="text-base leading-none">{s.emoji}</span> {s.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSeasonKey((k) => (k === "other" ? "" : "other"))}
              className={chip(seasonKey === "other")}
            >
              <span className="text-base leading-none">✏️</span> Other
            </button>
          </div>
          {seasonKey === "other" && (
            <input
              autoFocus
              value={customSeason}
              onChange={(e) => setCustomSeason(e.target.value)}
              placeholder="e.g. Preseason"
              className="mt-1 w-48 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
            />
          )}
        </div>

        {/* Year */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Year</span>
          <div className="flex flex-wrap gap-2">
            {YEARS.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setYear((cur) => (cur === y ? "" : y))}
                className={chip(year === y)}
              >
                {y}
              </button>
            ))}
          </div>
        </div>

        {/* Sport */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Sport (optional)</span>
          <div className="flex flex-wrap gap-2">
            {SPORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSportKey((k) => (k === s.key ? "" : s.key))}
                className={chip(sportKey === s.key)}
              >
                <span className="text-base leading-none">{s.emoji}</span> {s.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSportKey((k) => (k === "other" ? "" : "other"))}
              className={chip(sportKey === "other")}
            >
              <span className="text-base leading-none">✏️</span> Other
            </button>
          </div>
          {sportKey === "other" && (
            <input
              value={customSport}
              onChange={(e) => setCustomSport(e.target.value)}
              placeholder="Type a sport"
              className="mt-1 w-48 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
            />
          )}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={create}
          disabled={busy}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Creating…" : preview ? `Create “${preview}” →` : "Create season →"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="text-sm font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
