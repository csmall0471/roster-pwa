"use client";

import { useState } from "react";
import { track } from "@vercel/analytics";
import { fetchCardForPrint } from "@/lib/cardgen/print-normalize";
import { buildZip, type ZipEntry } from "@/app/_components/cardgen/zip";

// One in-progress season (a team whose season is currently active) and every
// card attached to it. `back` is null for single-sided cards.
export type SeasonGroup = {
  teamId: string;
  teamName: string;
  season: string | null;
  cards: { front: string; back: string | null; name: string }[];
};

// Filesystem-safe slug for zip folder / file names.
function slug(s: string): string {
  return (
    s
      .trim()
      .replace(/[^\w-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "card"
  );
}

// Ensure each zip path is unique (two unnamed cards, or two same-named players
// on one team, would otherwise collide and overwrite in the archive).
function uniquePath(path: string, used: Set<string>): string {
  if (!used.has(path)) {
    used.add(path);
    return path;
  }
  const dot = path.lastIndexOf(".");
  const stem = dot === -1 ? path : path.slice(0, dot);
  const ext = dot === -1 ? "" : path.slice(dot);
  let n = 2;
  let next = `${stem}-${n}${ext}`;
  while (used.has(next)) next = `${stem}-${++n}${ext}`;
  used.add(next);
  return next;
}

// Card Creator → "Save all cards from in-progress seasons". Bundles every card
// (front + back) across the coach's currently-active seasons into a single
// print-ready ZIP: each image is normalized to 2.6×3.6" / 350 DPI with bleed
// (same as the per-team save), organized into one folder per season.
export default function SeasonCardsSaver({ seasons }: { seasons: SeasonGroup[] }) {
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(0);

  if (seasons.length === 0) return null;

  const totalFiles = seasons.reduce(
    (n, s) => n + s.cards.reduce((m, c) => m + 1 + (c.back ? 1 : 0), 0),
    0
  );
  const totalCards = seasons.reduce((n, s) => n + s.cards.length, 0);

  async function handleSaveAll() {
    if (saving) return;
    setSaving(true);
    setDone(0);
    try {
      const entries: ZipEntry[] = [];
      const used = new Set<string>();
      let n = 0;
      for (const s of seasons) {
        const folder = slug([s.teamName, s.season].filter(Boolean).join("-"));
        for (const c of s.cards) {
          const base = slug(c.name);
          const front = await fetchCardForPrint(c.front, `${base}-front.png`);
          entries.push({
            name: uniquePath(`${folder}/${base}-front.png`, used),
            data: new Uint8Array(await front.arrayBuffer()),
          });
          setDone(++n);
          if (c.back) {
            const back = await fetchCardForPrint(c.back, `${base}-back.png`);
            entries.push({
              name: uniquePath(`${folder}/${base}-back.png`, used),
              data: new Uint8Array(await back.arrayBuffer()),
            });
            setDone(++n);
          }
        }
      }

      track("card_creator_save_inprogress", { seasons: seasons.length, files: entries.length });

      const zip = buildZip(entries);
      const stamp = new Date().toISOString().slice(0, 10);
      const zipName = `in-progress-cards-${stamp}.zip`;
      const zipFile = new File([zip], zipName, { type: "application/zip" });

      // Phones: offer the share sheet (Save to Files); everything else downloads.
      if (navigator.canShare?.({ files: [zipFile] })) {
        try {
          await navigator.share({ files: [zipFile] });
          return;
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
        }
      }
      const url = URL.createObjectURL(zip);
      const a = document.createElement("a");
      a.href = url;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // A card failed to fetch, or the user dismissed the share sheet.
    } finally {
      setSaving(false);
      setDone(0);
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 lg:max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            Save in-progress season cards
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Download every card from your {seasons.length === 1 ? "active season" : `${seasons.length} active seasons`} as one
            print-ready ZIP (2.6×3.6&quot; @ 350 DPI, front &amp; back).
          </p>
        </div>
        <button
          onClick={handleSaveAll}
          disabled={saving || totalFiles === 0}
          className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {saving ? `Saving… ${done}/${totalFiles}` : `↓ Save all (${totalCards})`}
        </button>
      </div>

      <ul className="mt-3 space-y-1 border-t border-gray-100 dark:border-gray-800 pt-3">
        {seasons.map((s) => (
          <li
            key={s.teamId}
            className="flex items-center justify-between gap-3 text-xs text-gray-600 dark:text-gray-300"
          >
            <span className="truncate">
              {s.teamName}
              {s.season ? (
                <span className="text-gray-400 dark:text-gray-500"> · {s.season}</span>
              ) : null}
            </span>
            <span className="shrink-0 text-gray-400 dark:text-gray-500">
              {s.cards.length} card{s.cards.length !== 1 ? "s" : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
