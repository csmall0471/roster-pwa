"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { getCardVersions, restoreCardVersion, type CardVersion } from "../../photo-actions";

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Coach-only "version history" for one live card. Lists every saved snapshot
// (newest first, the top one is the current card) and can roll the live card
// back to any earlier one. Opened from the card Lightbox.
export default function CardVersionsModal({
  cardPhotoId,
  onClose,
}: {
  cardPhotoId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [versions, setVersions] = useState<CardVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getCardVersions(cardPhotoId);
      if (cancelled) return;
      if (res.error) setError(res.error);
      else setVersions(res.versions ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [cardPhotoId]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  function handleRestore(id: string) {
    if (
      !confirm(
        "Restore this version as the current card? Your current card is kept in the history too."
      )
    )
      return;
    setError(null);
    start(async () => {
      const res = await restoreCardVersion(id);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
      onClick={(e) => {
        // Close only this modal, not the Lightbox underneath.
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-white dark:bg-gray-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 p-4">
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Version history</h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Every save is kept — restore any earlier version.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-xs font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            Close
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto p-4">
          {error && <p className="text-xs text-red-500">{error}</p>}

          {versions === null && !error && (
            <div className="py-8 text-center">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              <p className="mt-2 text-xs text-gray-400">Loading versions…</p>
            </div>
          )}

          {versions?.length === 0 && (
            <p className="py-6 text-center text-xs text-gray-400 dark:text-gray-500">
              No saved versions yet. Each time this card is saved, a version is kept here.
            </p>
          )}

          {versions?.map((v, i) => (
            <div
              key={v.id}
              className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-2"
            >
              {v.publicUrl ? (
                <Image
                  src={v.publicUrl}
                  alt="Card version"
                  width={48}
                  height={67}
                  className="h-[67px] w-12 shrink-0 rounded-lg border border-gray-200 dark:border-gray-700 object-cover"
                />
              ) : (
                <div className="h-[67px] w-12 shrink-0 rounded-lg border border-dashed border-gray-200 dark:border-gray-700" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-xs font-semibold text-gray-900 dark:text-white">
                    {fmt(v.createdAt)}
                  </span>
                  {i === 0 && (
                    <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                      Current
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">by {v.editor}</p>
              </div>
              {i !== 0 && (
                <button
                  onClick={() => handleRestore(v.id)}
                  disabled={pending}
                  className="shrink-0 rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                >
                  {pending ? "…" : "Restore"}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
