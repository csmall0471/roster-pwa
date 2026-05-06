"use client";

import { useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { assignPhotoToTeam } from "@/app/(protected)/players/photo-actions";

type TeamPhoto = {
  id: string;
  public_url: string;
  team_name: string | null;
  season: string | null;
  is_primary: boolean;
  players: { id: string; first_name: string; last_name: string } | null;
};

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
        <div className="px-2 py-1.5">
          <Link
            href={`/players/${photo.players.id}`}
            className="text-xs font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 truncate block"
          >
            {photo.players.first_name} {photo.players.last_name}
          </Link>
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

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {photos.map((photo) => (
        <PhotoCard key={photo.id} photo={photo} teamId={teamId} />
      ))}
    </div>
  );
}
