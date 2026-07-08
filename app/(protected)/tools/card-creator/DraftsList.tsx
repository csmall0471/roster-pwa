"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { track } from "@vercel/analytics";
import { deleteCardDraft } from "./draft-actions";

export type DraftRow = {
  id: string;
  label: string | null;
  team_name: string | null;
  season: string | null;
  front_url: string | null;
  back_url: string | null;
  updated_at: string;
  // Set when the draft is earmarked for a kid (still off their profile).
  player_name?: string | null;
};

function draftFileName(d: DraftRow, side: "front" | "back") {
  const who =
    d.player_name || d.label || [d.team_name, d.season].filter(Boolean).join("-") || "card";
  return `${who.replace(/\s+/g, "-")}-${side}.png`;
}

async function fetchAsFile(url: string, name: string): Promise<File> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || "image/png" });
}

export default function DraftsList({
  drafts,
  activeId,
}: {
  drafts: DraftRow[];
  activeId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  if (drafts.length === 0) return null;

  const allSelected = selected.size === drafts.length;

  function remove(id: string) {
    start(async () => {
      await deleteCardDraft(id);
      if (id === activeId) router.push("/tools/card-creator");
      else router.refresh();
    });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(drafts.map((d) => d.id)));
  }

  // Save each selected draft's front (and back when present) to the device —
  // share sheet on phones (Save to Photos/Files), sequential downloads on desktop.
  async function downloadSelected() {
    if (saving || selected.size === 0) return;
    setSaving(true);
    try {
      const chosen = drafts.filter((d) => selected.has(d.id));
      const files: File[] = [];
      for (const d of chosen) {
        if (d.front_url) files.push(await fetchAsFile(d.front_url, draftFileName(d, "front")));
        if (d.back_url) files.push(await fetchAsFile(d.back_url, draftFileName(d, "back")));
      }
      if (files.length === 0) return;
      track("card_drafts_download", { drafts: chosen.length, files: files.length });
      if (navigator.canShare?.({ files })) {
        await navigator.share({ files });
        return;
      }
      for (const file of files) {
        const url = URL.createObjectURL(file);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        await new Promise((r) => setTimeout(r, 200));
      }
    } catch {
      // User dismissed the share sheet, or a fetch failed — nothing to do.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Drafts <span className="text-gray-400">({drafts.length})</span>
        </h2>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleAll}
            className="text-xs text-gray-500 dark:text-gray-400 hover:underline"
          >
            {allSelected ? "Clear" : "Select all"}
          </button>
          <button
            onClick={downloadSelected}
            disabled={saving || selected.size === 0}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40 disabled:no-underline"
          >
            {saving
              ? "Saving…"
              : selected.size
                ? `↓ Download ${selected.size} (front & back)`
                : "↓ Download selected"}
          </button>
        </div>
      </div>
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {drafts.map((d) => (
          <li
            key={d.id}
            className={`relative rounded-xl border p-2 bg-white dark:bg-gray-900 ${
              selected.has(d.id)
                ? "border-blue-500 ring-2 ring-blue-500"
                : d.id === activeId
                  ? "border-blue-500 ring-1 ring-blue-500"
                  : "border-gray-200 dark:border-gray-800"
            }`}
          >
            <button
              type="button"
              onClick={() => toggle(d.id)}
              aria-pressed={selected.has(d.id)}
              aria-label={selected.has(d.id) ? "Deselect draft" : "Select draft"}
              className={`absolute top-3 right-3 z-10 w-6 h-6 rounded-md border-2 flex items-center justify-center text-[13px] font-bold leading-none transition-colors ${
                selected.has(d.id)
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "bg-white/90 dark:bg-gray-900/90 border-gray-300 dark:border-gray-600 text-transparent hover:border-blue-400"
              }`}
            >
              ✓
            </button>
            <Link href={`/tools/card-creator?draft=${d.id}`} className="block">
              <div className="relative">
                {d.front_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={d.front_url}
                    alt=""
                    className="w-full aspect-[5/7] object-cover rounded-lg bg-gray-100 dark:bg-gray-800"
                  />
                ) : (
                  <div className="w-full aspect-[5/7] rounded-lg bg-gray-100 dark:bg-gray-800" />
                )}
                {d.player_name && (
                  <span className="absolute top-1.5 left-1.5 max-w-[85%] truncate rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    For {d.player_name}
                  </span>
                )}
              </div>
              <div className="mt-1.5 text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
                {d.label || "Untitled"}
              </div>
              <div className="text-[11px] text-gray-400 truncate">
                {[d.team_name, d.season].filter(Boolean).join(" · ") || "—"}
              </div>
            </Link>
            <button
              onClick={() => remove(d.id)}
              disabled={pending}
              className="mt-1 text-[11px] font-medium text-gray-400 hover:text-red-600 disabled:opacity-50"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
