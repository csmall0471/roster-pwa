"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import Image from "next/image";
import type { PlayerPhoto } from "@/lib/types";
import { setPrimaryPhoto, deletePlayerPhoto, assignPhotoToTeam } from "../../photo-actions";

type PlayerTeam = { id: string; name: string; season: string | null };

// ── Gallery grid ──────────────────────────────────────────────

export default function PhotoGallery({
  photos,
  playerId,
  playerTeams,
}: {
  photos: PlayerPhoto[];
  playerId: string;
  playerTeams?: PlayerTeam[];
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {photos.map((photo, i) => (
          <PhotoCard
            key={photo.id}
            photo={photo}
            playerId={playerId}
            playerTeams={playerTeams}
            onOpen={() => setLightboxIndex(i)}
          />
        ))}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          photos={photos}
          initialIndex={lightboxIndex}
          playerId={playerId}
          playerTeams={playerTeams}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}

// ── Thumbnail card ────────────────────────────────────────────

function PhotoCard({
  photo,
  playerId,
  playerTeams,
  onOpen,
}: {
  photo: PlayerPhoto;
  playerId: string;
  playerTeams?: PlayerTeam[];
  onOpen: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function handleSetPrimary(e: React.MouseEvent) {
    e.stopPropagation();
    startTransition(async () => {
      await setPrimaryPhoto(photo.id, playerId);
    });
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Remove this card? It will be deleted from storage.")) return;
    startTransition(async () => {
      await deletePlayerPhoto(photo.id, photo.storage_path, playerId);
    });
  }

  const assignedTeam =
    photo.team_id && playerTeams
      ? playerTeams.find((t) => t.id === photo.team_id)
      : null;

  return (
    <div
      onClick={onOpen}
      className={`relative rounded-xl overflow-hidden border-2 cursor-pointer transition-opacity ${
        photo.is_primary ? "border-blue-500" : "border-gray-200 dark:border-gray-700"
      } ${pending ? "opacity-40 pointer-events-none" : ""}`}
    >
      <Image
        src={photo.public_url}
        alt={`${photo.team_name ?? ""} ${photo.season ?? ""}`.trim() || "Season card"}
        width={200}
        height={280}
        className="w-full object-cover aspect-[5/7]"
      />

      {photo.is_primary && (
        <span className="absolute top-2 left-2 bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
          CURRENT
        </span>
      )}

      {/* Team badge overlay */}
      {assignedTeam && (
        <span className="absolute top-2 right-2 bg-gray-700/80 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full max-w-[80px] truncate">
          {assignedTeam.name}
        </span>
      )}

      {(photo.team_name || photo.season) && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
          <p className="text-white text-xs font-medium leading-tight">
            {photo.team_name}
            {photo.team_name && photo.season ? " · " : ""}
            {photo.season}
          </p>
        </div>
      )}

      <div className="absolute inset-0 bg-black/0 hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 hover:opacity-100">
        {!photo.is_primary && (
          <button
            onClick={handleSetPrimary}
            className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-semibold px-2 py-1 rounded-lg shadow hover:bg-blue-50 dark:hover:bg-gray-700"
          >
            Set current
          </button>
        )}
        <button
          onClick={handleDelete}
          className="bg-white dark:bg-gray-800 text-red-600 dark:text-red-400 text-xs font-semibold px-2 py-1 rounded-lg shadow hover:bg-red-50 dark:hover:bg-gray-700"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ── Lightbox ──────────────────────────────────────────────────

function Lightbox({
  photos,
  initialIndex,
  playerId,
  playerTeams,
  onClose,
}: {
  photos: PlayerPhoto[];
  initialIndex: number;
  playerId: string;
  playerTeams?: PlayerTeam[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [pending, startTransition] = useTransition();

  const photo = photos[index];
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const next = useCallback(() => setIndex((i) => Math.min(photos.length - 1, i + 1)), [photos.length]);

  // Keyboard nav
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft")  prev();
      if (e.key === "ArrowRight") next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, prev, next]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  function handleSetPrimary() {
    startTransition(async () => {
      await setPrimaryPhoto(photo.id, playerId);
    });
  }

  function handleDelete() {
    if (!confirm("Remove this card? It will be deleted from storage.")) return;
    startTransition(async () => {
      await deletePlayerPhoto(photo.id, photo.storage_path, playerId);
      // Move to adjacent photo or close
      if (photos.length === 1) {
        onClose();
      } else {
        setIndex((i) => Math.min(i, photos.length - 2));
      }
    });
  }

  function handleTeamChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    startTransition(async () => {
      await assignPhotoToTeam(photo.id, value || null, playerId);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl leading-none z-10"
        aria-label="Close"
      >
        ×
      </button>

      {/* Counter */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-sm tabular-nums">
        {index + 1} / {photos.length}
      </div>

      {/* Prev arrow */}
      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); prev(); }}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-4xl leading-none z-10 px-3 py-4"
          aria-label="Previous"
        >
          ‹
        </button>
      )}

      {/* Photo */}
      <div
        className="relative max-h-[90dvh] max-w-[min(90vw,420px)] w-full flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <Image
          src={photo.public_url}
          alt={`${photo.team_name ?? ""} ${photo.season ?? ""}`.trim() || "Season card"}
          width={420}
          height={588}
          className="max-h-[90dvh] w-auto rounded-xl object-contain shadow-2xl"
          priority
        />

        {/* Primary badge */}
        {photo.is_primary && (
          <span className="absolute top-3 left-3 bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            CURRENT
          </span>
        )}

        {/* Caption + actions */}
        <div className="absolute bottom-0 left-0 right-0 rounded-b-xl bg-gradient-to-t from-black/80 to-transparent px-4 pt-8 pb-4">
          {(photo.team_name || photo.season) && (
            <p className="text-white text-sm font-medium mb-3">
              {photo.team_name}
              {photo.team_name && photo.season ? " · " : ""}
              {photo.season}
            </p>
          )}

          {/* Team assignment */}
          {playerTeams && playerTeams.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-white/70 text-xs shrink-0">Team:</span>
              <select
                value={photo.team_id ?? ""}
                onChange={handleTeamChange}
                disabled={pending}
                className="flex-1 text-xs rounded-lg bg-white/20 text-white border border-white/30 px-2 py-1 focus:outline-none focus:border-white/60 disabled:opacity-50"
              >
                <option value="">No team</option>
                {playerTeams.map((t) => (
                  <option key={t.id} value={t.id} className="text-gray-900 bg-white">
                    {t.name}{t.season ? ` (${t.season})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2">
            {!photo.is_primary && (
              <button
                onClick={handleSetPrimary}
                disabled={pending}
                className="flex-1 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-2 transition-colors disabled:opacity-50"
              >
                Set as current
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={pending}
              className="rounded-lg bg-white/20 hover:bg-red-500/60 text-white text-xs font-semibold px-3 py-2 transition-colors disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Next arrow */}
      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); next(); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-4xl leading-none z-10 px-3 py-4"
          aria-label="Next"
        >
          ›
        </button>
      )}
    </div>
  );
}
