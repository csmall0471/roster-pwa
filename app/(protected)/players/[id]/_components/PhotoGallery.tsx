"use client";

import { useTransition } from "react";
import Image from "next/image";
import type { PlayerPhoto } from "@/lib/types";
import { setPrimaryPhoto, deletePlayerPhoto } from "../../photo-actions";

export default function PhotoGallery({
  photos,
  playerId,
}: {
  photos: PlayerPhoto[];
  playerId: string;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {photos.map((photo) => (
        <PhotoCard key={photo.id} photo={photo} playerId={playerId} />
      ))}
    </div>
  );
}

function PhotoCard({ photo, playerId }: { photo: PlayerPhoto; playerId: string }) {
  const [pending, startTransition] = useTransition();

  function handleSetPrimary() {
    startTransition(async () => {
      await setPrimaryPhoto(photo.id, playerId);
    });
  }

  function handleDelete() {
    if (!confirm("Remove this card? It will be deleted from storage.")) return;
    startTransition(async () => {
      await deletePlayerPhoto(photo.id, photo.storage_path, playerId);
    });
  }

  return (
    <div
      className={`relative rounded-xl overflow-hidden border-2 transition-opacity ${
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

      {/* Primary badge */}
      {photo.is_primary && (
        <span className="absolute top-2 left-2 bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
          CURRENT
        </span>
      )}

      {/* Season label */}
      {(photo.team_name || photo.season) && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
          <p className="text-white text-xs font-medium leading-tight">
            {photo.team_name}
            {photo.team_name && photo.season ? " · " : ""}
            {photo.season}
          </p>
        </div>
      )}

      {/* Hover actions */}
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
