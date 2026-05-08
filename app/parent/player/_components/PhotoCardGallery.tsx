"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";

type PhotoCard = {
  id: string;
  public_url: string;
  team_name: string | null;
  season: string | null;
  is_primary: boolean;
};

function photoFileName(photo: PhotoCard) {
  const label = [photo.team_name, photo.season].filter(Boolean).join("-") || "card";
  return `${label.replace(/\s+/g, "-")}.jpg`;
}

async function fetchPhotoFile(photo: PhotoCard): Promise<File> {
  const res = await fetch(photo.public_url);
  const blob = await res.blob();
  return new File([blob], photoFileName(photo), { type: blob.type || "image/jpeg" });
}

async function savePhoto(photo: PhotoCard) {
  const file = await fetchPhotoFile(photo);
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] });
    return;
  }
  // Desktop fallback: browser download
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function PhotoCardGallery({ photos }: { photos: PhotoCard[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const close = useCallback(() => setActiveIndex(null), []);
  const prev = useCallback(() => setActiveIndex(i => i !== null ? (i - 1 + photos.length) % photos.length : null), [photos.length]);
  const next = useCallback(() => setActiveIndex(i => i !== null ? (i + 1) % photos.length : null), [photos.length]);

  useEffect(() => {
    if (activeIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft")  prev();
      if (e.key === "ArrowRight") next();
      if (e.key === "Escape")     close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, prev, next, close]);

  async function handleDownloadAll() {
    setDownloading(true);
    try {
      const files = await Promise.all(photos.map(fetchPhotoFile));
      if (navigator.canShare?.({ files })) {
        await navigator.share({ files });
        setDownloading(false);
        return;
      }
    } catch { /* cancelled or unsupported — fall through */ }
    // Desktop fallback: download one by one
    for (const photo of photos) {
      try {
        await savePhoto(photo);
        await new Promise(r => setTimeout(r, 200));
      } catch { /* skip */ }
    }
    setDownloading(false);
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) dx < 0 ? next() : prev();
    touchStartX.current = null;
  }

  const active = activeIndex !== null ? photos[activeIndex] : null;

  return (
    <>
      {/* Download all */}
      {photos.length > 0 && (
        <div className="mb-3">
          <button
            onClick={handleDownloadAll}
            disabled={downloading}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
          >
            {downloading ? "Saving…" : `↓ Save all ${photos.length} card${photos.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {photos.map((photo, i) => (
          <button
            key={photo.id}
            onClick={() => setActiveIndex(i)}
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

      {/* Fullscreen carousel */}
      {active !== null && activeIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex flex-col"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onClick={close}
        >
          {/* Header bar */}
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            onClick={e => e.stopPropagation()}
          >
            <span className="text-white/50 text-sm tabular-nums">
              {activeIndex + 1} / {photos.length}
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={async e => {
                  e.stopPropagation();
                  try { await savePhoto(active); } catch { /* ignore */ }
                }}
                className="text-white/70 hover:text-white text-sm px-3 py-1 rounded-lg border border-white/20 hover:border-white/40 transition-colors"
              >
                ↓ Save
              </button>
              <button
                onClick={e => { e.stopPropagation(); close(); }}
                className="text-white/70 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center"
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>

          {/* Image */}
          <div
            className="flex-1 flex items-center justify-center px-14 min-h-0"
            onClick={e => e.stopPropagation()}
          >
            <Image
              src={active.public_url}
              alt={`${active.team_name ?? ""} ${active.season ?? ""}`.trim() || "Season card"}
              width={600}
              height={840}
              className="w-auto object-contain rounded-xl"
              style={{ maxHeight: "calc(100vh - 140px)" }}
            />
          </div>

          {/* Caption */}
          {(active.team_name || active.season) && (
            <div className="text-center py-2 shrink-0" onClick={e => e.stopPropagation()}>
              <p className="text-white/60 text-sm">
                {active.team_name}{active.team_name && active.season ? " · " : ""}{active.season}
              </p>
            </div>
          )}

          {/* Dot indicators */}
          {photos.length > 1 && (
            <div className="flex justify-center gap-1.5 pb-4 shrink-0" onClick={e => e.stopPropagation()}>
              {photos.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveIndex(i)}
                  className={`rounded-full transition-all ${i === activeIndex ? "w-4 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/30"}`}
                />
              ))}
            </div>
          )}

          {/* Prev / Next arrows */}
          {photos.length > 1 && (
            <>
              <button
                onClick={e => { e.stopPropagation(); prev(); }}
                className="absolute left-1 top-1/2 -translate-y-1/2 text-white/60 hover:text-white text-4xl w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                aria-label="Previous"
              >
                ‹
              </button>
              <button
                onClick={e => { e.stopPropagation(); next(); }}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-white/60 hover:text-white text-4xl w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                aria-label="Next"
              >
                ›
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
