"use client";

import { useState } from "react";
import Image from "next/image";

type PhotoCard = {
  id: string;
  public_url: string;
  team_name: string | null;
  season: string | null;
  is_primary: boolean;
};

export default function PhotoCardGallery({ photos }: { photos: PhotoCard[] }) {
  const [active, setActive] = useState<PhotoCard | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {photos.map((photo) => (
          <button
            key={photo.id}
            onClick={() => setActive(photo)}
            className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 cursor-zoom-in hover:opacity-90 transition-opacity text-left"
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
            {(photo.team_name || photo.season) && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
                <p className="text-white text-xs font-medium leading-tight">
                  {photo.team_name}{photo.team_name && photo.season ? " · " : ""}{photo.season}
                </p>
              </div>
            )}
          </button>
        ))}
      </div>

      {active && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setActive(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl leading-none"
            onClick={() => setActive(null)}
            aria-label="Close"
          >
            ×
          </button>
          <div
            className="relative max-h-[90vh] flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={active.public_url}
              alt={`${active.team_name ?? ""} ${active.season ?? ""}`.trim() || "Season card"}
              width={600}
              height={840}
              className="max-h-[80vh] w-auto object-contain rounded-xl"
            />
            {(active.team_name || active.season) && (
              <p className="text-white/80 text-sm">
                {active.team_name}{active.team_name && active.season ? " · " : ""}{active.season}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
