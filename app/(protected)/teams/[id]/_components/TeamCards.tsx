"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { track } from "@vercel/analytics";
import { assignPhotoToTeam } from "@/app/(protected)/players/photo-actions";

type TeamPhoto = {
  id: string;
  public_url: string;
  back_public_url: string | null;
  team_name: string | null;
  season: string | null;
  is_primary: boolean;
  // Present only on cards built in the Card Creator — those can be reopened and
  // edited. Uploaded-image cards have no design, so they aren't editable.
  card_design: unknown | null;
  players: { id: string; first_name: string; last_name: string } | null;
};

// Name a downloaded file after the player (coaches save a whole team at once),
// falling back to team/season when the card isn't attached to anyone.
function cardFileName(photo: TeamPhoto, side: "front" | "back") {
  const who = photo.players
    ? `${photo.players.first_name}-${photo.players.last_name}`
    : [photo.team_name, photo.season].filter(Boolean).join("-") || "card";
  return `${who.replace(/\s+/g, "-")}-${side}.jpg`;
}

async function fetchAsFile(url: string, name: string): Promise<File> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}

function PhotoCard({
  photo,
  teamId,
}: {
  photo: TeamPhoto;
  teamId: string;
}) {
  const [pending, startTransition] = useTransition();

  function handleRemove() {
    if (!photo.players) return;
    startTransition(async () => {
      await assignPhotoToTeam(photo.id, null, photo.players!.id);
    });
  }

  return (
    <div className={`relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 ${pending ? "opacity-40" : ""}`}>
      <div className="relative aspect-[5/7] bg-gray-100 dark:bg-gray-800">
        <Image
          src={photo.public_url}
          alt={`${photo.team_name ?? ""} ${photo.season ?? ""}`.trim() || "Season card"}
          width={200}
          height={280}
          className="w-full object-cover aspect-[5/7] rounded-t-xl"
        />
        {photo.is_primary && (
          <span className="absolute top-2 left-2 bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            CURRENT
          </span>
        )}
        <button
          onClick={handleRemove}
          disabled={pending}
          title="Remove from team"
          className="absolute top-2 right-2 bg-black/50 hover:bg-red-600/80 text-white text-xs font-semibold w-6 h-6 rounded-full flex items-center justify-center transition-colors disabled:opacity-50"
        >
          ×
        </button>
      </div>
      {photo.players && (
        <div className="px-2 py-1.5 flex items-center justify-between gap-1">
          <Link
            href={`/players/${photo.players.id}`}
            className="text-xs font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 truncate"
          >
            {photo.players.first_name} {photo.players.last_name}
          </Link>
          {!!photo.card_design && (
            <Link
              href={`/players/${photo.players.id}/card?team=${teamId}&photo=${photo.id}`}
              className="shrink-0 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Edit
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export default function TeamCards({
  photos,
  teamId,
}: {
  photos: TeamPhoto[];
  teamId: string;
}) {
  const [saving, setSaving] = useState(false);

  // Save every card's front (and back when present) to the device. On phones
  // navigator.share surfaces "Save to Photos / Files"; desktop falls back to
  // sequential downloads.
  async function handleSaveAll() {
    if (saving) return;
    setSaving(true);
    try {
      const files: File[] = [];
      for (const p of photos) {
        files.push(await fetchAsFile(p.public_url, cardFileName(p, "front")));
        if (p.back_public_url) {
          files.push(await fetchAsFile(p.back_public_url, cardFileName(p, "back")));
        }
      }
      track("team_cards_download_all", { team: teamId, files: files.length });
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

  if (photos.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500 dark:text-gray-400">
        <p className="text-sm font-medium mb-1">No cards for this season yet.</p>
        <Link
          href={`/players/upload?team=${teamId}`}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          Upload cards →
        </Link>
      </div>
    );
  }

  const hasBacks = photos.some((p) => p.back_public_url);

  return (
    <>
      <div className="mb-3">
        <button
          onClick={handleSaveAll}
          disabled={saving}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
        >
          {saving
            ? "Saving…"
            : `↓ Save all ${photos.length} card${photos.length !== 1 ? "s" : ""}${hasBacks ? " (front & back)" : ""}`}
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {photos.map((photo) => (
          <PhotoCard key={photo.id} photo={photo} teamId={teamId} />
        ))}
      </div>
    </>
  );
}
