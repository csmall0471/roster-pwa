"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import { createClient } from "@/lib/supabase/client";
import { logClientActivity } from "@/app/actions/log-activity";
import type { AssignTarget } from "@/app/_components/cardgen/CardEditor";
import { normalizePhotoForUpload } from "@/app/_components/cardgen/photo-normalize";
import { createPhotoDrafts } from "../draft-actions";
import { matchPhotoToTarget } from "./match-photo";
import { photoDraftPath } from "./photo-path";

type Photo = {
  // Doubles as the draft's id, so retrying a save can't create a second draft.
  id: string;
  fileName: string;
  signature: string;
  status: "reading" | "ready" | "unreadable";
  blob?: Blob;
  thumbUrl?: string;
  targetKey: string;
  matchedFromName: boolean;
  // The coach set this back to "Who is this?", so don't auto-match it again.
  pickCleared?: boolean;
  uploaded: boolean;
  error?: string;
};

const READ_CONCURRENCY = 2;
const UPLOAD_CONCURRENCY = 3;
const UPLOAD_TIMEOUT_MS = 60_000;
const DRAFTS_PER_CALL = 50;

const ALL_TEAMS = "";

async function forEachLimited<T>(items: T[], limit: number, run: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await run(items[next++]);
    })
  );
}

function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

const LEAVE_MESSAGE = "Leave this page? Photos you haven't saved will be removed.";

export default function BulkDraftUploader({
  initialTargets,
  loadFailed,
  existingDraftKeys,
  initialTeamId,
}: {
  initialTargets: AssignTarget[];
  loadFailed: boolean;
  existingDraftKeys: string[];
  initialTeamId: string | null;
}) {
  // Saving refreshes this route. Holding the first list means a failed refresh
  // can't take the grid and the unsaved photos with it.
  const [targets] = useState(initialTargets);
  const teams = useMemo(() => {
    const byId = new Map<string, { id: string; label: string; count: number }>();
    for (const t of targets) {
      if (!t.teamId) continue;
      const team = byId.get(t.teamId);
      if (team) team.count++;
      else
        byId.set(t.teamId, {
          id: t.teamId,
          label: [t.teamName, t.season].filter(Boolean).join(" · "),
          count: 1,
        });
    }
    return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [targets]);

  const [teamId, setTeamId] = useState<string>(() => {
    if (initialTeamId) return teams.some((t) => t.id === initialTeamId) ? initialTeamId : ALL_TEAMS;
    return teams.length === 1 ? teams[0].id : ALL_TEAMS;
  });
  const requestedTeamMissing = !!initialTeamId && !teams.some((t) => t.id === initialTeamId);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [draftKeys, setDraftKeys] = useState(() => new Set(existingDraftKeys));
  const [enlarged, setEnlarged] = useState<{ url: string; name: string } | null>(null);

  // Mirrors of state that async work and unmount cleanup read after a render.
  const removedIds = useRef(new Set<string>());
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(
    () => () => {
      for (const p of photosRef.current) if (p.thumbUrl) URL.revokeObjectURL(p.thumbUrl);
    },
    []
  );

  // Photos live only in this tab until saved, so warn before leaving. In-app
  // links never fire beforeunload, so those are caught separately.
  const savablePhotos = photos.filter((p) => p.status !== "unreadable").length;
  const hasUnsaved = savablePhotos > 0;
  const backGuardPushed = useRef(false);
  useEffect(() => {
    if (!hasUnsaved) return;
    // Back never fires beforeunload either, so a spare history entry absorbs the
    // press. The copied state is what keeps Next's router from reloading the page.
    const armBackGuard = () =>
      window.history.pushState(window.history.state, "", window.location.href);
    if (!backGuardPushed.current) {
      backGuardPushed.current = true;
      armBackGuard();
    }
    const guardBack = () => {
      if (window.confirm(LEAVE_MESSAGE)) {
        window.removeEventListener("popstate", guardBack);
        window.history.back();
      } else {
        armBackGuard();
      }
    };
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    const guardLinks = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element).closest?.<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || link.origin !== window.location.origin) return;
      if (!window.confirm(LEAVE_MESSAGE)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardLinks, true);
    window.addEventListener("popstate", guardBack);
    return () => {
      window.removeEventListener("popstate", guardBack);
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guardLinks, true);
    };
  }, [hasUnsaved]);

  const targetByKey = useMemo(() => new Map(targets.map((t) => [t.key, t])), [targets]);
  const teamTargets = useMemo(
    () => (teamId ? targets.filter((t) => t.teamId === teamId) : targets),
    [targets, teamId]
  );

  const patchPhoto = (id: string, patch: Partial<Photo>) =>
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  async function addFiles(fileList: FileList | File[]) {
    const images = [...fileList].filter(
      (f) => f.type.startsWith("image/") || /\.(hei[cf]|jpe?g|png|webp)$/i.test(f.name)
    );
    const seen = new Set(photosRef.current.map((p) => p.signature));
    const queued: { file: File; photo: Photo }[] = [];
    let duplicates = 0;
    for (const file of images) {
      const signature = `${file.name}:${file.size}:${file.lastModified}`;
      if (seen.has(signature)) {
        duplicates++;
        continue;
      }
      seen.add(signature);
      const match = matchPhotoToTarget(file.name, teamTargets);
      queued.push({
        file,
        photo: {
          id: crypto.randomUUID(),
          fileName: file.name,
          signature,
          status: "reading",
          targetKey: match?.key ?? "",
          matchedFromName: !!match,
          uploaded: false,
        },
      });
    }
    const notImages = fileList.length - images.length;
    const skipped = [
      duplicates ? `${duplicates} already added` : null,
      notImages ? `${notImages} not a photo` : null,
    ].filter(Boolean);
    setNotice(skipped.length ? `Skipped ${skipped.join(" and ")}.` : null);
    if (queued.length === 0) return;
    setSavedCount(0);
    setSaveError(null);
    setPhotos((prev) => [...prev, ...queued.map((q) => q.photo)]);

    await forEachLimited(queued, READ_CONCURRENCY, async ({ file, photo }) => {
      if (removedIds.current.has(photo.id)) return;
      try {
        const blob = await normalizePhotoForUpload(file);
        const thumb = await normalizePhotoForUpload(blob, 420, 0.8);
        if (removedIds.current.has(photo.id)) return;
        patchPhoto(photo.id, { status: "ready", blob, thumbUrl: URL.createObjectURL(thumb) });
      } catch {
        patchPhoto(photo.id, {
          status: "unreadable",
          targetKey: "",
          matchedFromName: false,
          error: /\.hei[cf]$/i.test(file.name)
            ? "This browser can't open HEIC photos. Try Safari, or export the photo as a JPEG."
            : "This file couldn't be read as a photo.",
        });
      }
    });
  }

  function removePhoto(photo: Photo) {
    removedIds.current.add(photo.id);
    if (photo.thumbUrl) URL.revokeObjectURL(photo.thumbUrl);
    setSaveError(null);
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
  }

  // Choosing a team also matches any still-unmatched photos against its roster.
  function changeTeam(next: string) {
    setTeamId(next);
    const scoped = next ? targets.filter((t) => t.teamId === next) : targets;
    setPhotos((prev) =>
      prev.map((p) => {
        if (p.targetKey || p.pickCleared || p.status === "unreadable") return p;
        const match = matchPhotoToTarget(p.fileName, scoped);
        return match ? { ...p, targetKey: match.key, matchedFromName: true } : p;
      })
    );
  }

  function openEnlarged(photo: Photo) {
    if (!photo.blob) return;
    setEnlarged({ url: URL.createObjectURL(photo.blob), name: photo.fileName });
  }

  function closeEnlarged() {
    if (enlarged) URL.revokeObjectURL(enlarged.url);
    setEnlarged(null);
  }

  const pickCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of photos) {
      if (p.targetKey) counts.set(p.targetKey, (counts.get(p.targetKey) ?? 0) + 1);
    }
    return counts;
  }, [photos]);

  const ready = photos.filter((p) => p.status === "ready" && p.targetKey);
  const reading = photos.some((p) => p.status === "reading");
  const unmatched = photos.filter((p) => p.status === "ready" && !p.targetKey).length;
  const stillNeeded = teamId
    ? teamTargets.filter((t) => !pickCounts.has(t.key) && !draftKeys.has(t.key))
    : [];

  async function saveDrafts() {
    if (saving || ready.length === 0) return;
    setSaving(true);
    setSaveError(null);
    setNotice(null);
    const batch = ready;
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in again.");

      let done = batch.filter((p) => p.uploaded).length;
      setProgress(`Uploading ${done} of ${batch.length}…`);
      const uploaded = new Set(batch.filter((p) => p.uploaded).map((p) => p.id));
      await forEachLimited(
        batch.filter((p) => !p.uploaded),
        UPLOAD_CONCURRENCY,
        async (photo) => {
          try {
            const { error } = await withTimeout(
              supabase.storage
                .from("player-photos")
                .upload(photoDraftPath(user.id, photo.id), photo.blob!, {
                  contentType: "image/jpeg",
                  upsert: false,
                }),
              UPLOAD_TIMEOUT_MS,
              "Upload timed out."
            );
            // Already there means an earlier attempt finished after it timed out.
            if (error && !/exists|duplicate/i.test(error.message)) throw error;
            uploaded.add(photo.id);
            patchPhoto(photo.id, { uploaded: true, error: undefined });
          } catch (e) {
            patchPhoto(photo.id, {
              error: e instanceof Error ? e.message : "Upload failed.",
            });
          }
          done++;
          setProgress(`Uploading ${done} of ${batch.length}…`);
        }
      );

      setProgress("Saving drafts…");
      const toSave = batch.filter((p) => uploaded.has(p.id));
      const savedIds = new Set<string>();
      let failure: string | null = null;
      for (let i = 0; i < toSave.length; i += DRAFTS_PER_CALL) {
        const chunk = toSave.slice(i, i + DRAFTS_PER_CALL);
        try {
          const res = await createPhotoDrafts(
            chunk.map((p) => ({ id: p.id, targetKey: p.targetKey }))
          );
          if (res.error) {
            failure = res.error;
            break;
          }
          for (const r of res.results ?? []) {
            if (r.error) patchPhoto(r.id, { error: r.error });
            else savedIds.add(r.id);
          }
        } catch (e) {
          failure = e instanceof Error ? e.message : "The save didn't finish. Try again.";
          break;
        }
      }

      const saved = batch.filter((p) => savedIds.has(p.id));
      for (const p of saved) if (p.thumbUrl) URL.revokeObjectURL(p.thumbUrl);
      setPhotos((prev) => prev.filter((p) => !savedIds.has(p.id)));
      setDraftKeys((prev) => new Set([...prev, ...saved.map((p) => p.targetKey)]));
      setSavedCount((n) => n + saved.length);
      if (saved.length > 0) {
        track("card_drafts_bulk_created", { drafts: saved.length });
        logClientActivity("card_drafts_bulk_created", { drafts: saved.length }).catch(() => {});
      }

      const left = batch.length - saved.length;
      if (failure) setSaveError(failure);
      else if (left > 0) {
        setSaveError(
          `${left} photo${left === 1 ? "" : "s"} didn't save. Check the message on each photo, then save again.`
        );
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
      setProgress(null);
    }
  }

  if (loadFailed && targets.length === 0) {
    return (
      <p className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-4 py-6 text-center text-sm text-red-700 dark:text-red-300">
        Couldn&apos;t load your players. Refresh the page to try again.
      </p>
    );
  }

  if (targets.length === 0) {
    return (
      <p className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
        No players to match yet. Players appear here once they&apos;re on a team whose season is in
        progress.
      </p>
    );
  }

  return (
    <div className="pb-24">
      <label className="block max-w-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Team
        </span>
        <select
          value={teamId}
          onChange={(e) => changeTeam(e.target.value)}
          disabled={saving}
          className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-base text-gray-900 dark:text-white sm:text-sm"
        >
          <option value={ALL_TEAMS}>All teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label} ({t.count})
            </option>
          ))}
        </select>
      </label>
      {requestedTeamMissing && teamId === ALL_TEAMS && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          That team isn&apos;t listed because it has no active players in a season that&apos;s in
          progress.
        </p>
      )}

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!saving) void addFiles(e.dataTransfer.files);
        }}
        className={`mt-4 block cursor-pointer rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
          dragging
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
            : "border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30"
        }`}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={saving}
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <span className="block text-3xl">📸</span>
        <span className="mt-2 block text-sm font-semibold text-gray-700 dark:text-gray-200">
          {photos.length ? "Add more photos" : "Choose photos"}
        </span>
        <span className="mt-1 hidden text-xs text-gray-400 dark:text-gray-500 sm:block">
          or drag them here
        </span>
      </label>

      {savedCount > 0 && (
        <p className="mt-4 rounded-lg bg-green-50 dark:bg-green-950/40 px-3 py-2 text-sm text-green-800 dark:text-green-300">
          ✓ Saved {savedCount} draft{savedCount === 1 ? "" : "s"}.{" "}
          <Link href="/tools/card-creator#drafts" className="font-semibold underline">
            View drafts
          </Link>
        </p>
      )}
      {notice && <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{notice}</p>}

      {teamId && stillNeeded.length > 0 && stillNeeded.length < teamTargets.length && (
        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          <span className="font-semibold">Still no photo or draft ({stillNeeded.length}):</span>{" "}
          {stillNeeded.map((t) => t.name).join(", ")}
        </p>
      )}

      {photos.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo) => {
            const target = photo.targetKey ? targetByKey.get(photo.targetKey) : undefined;
            const doubled = (pickCounts.get(photo.targetKey) ?? 0) > 1;
            const hasDraft = !!photo.targetKey && draftKeys.has(photo.targetKey);
            // Keep this photo's pick listed even if it's outside the current team.
            const options =
              target && !teamTargets.includes(target) ? [target, ...teamTargets] : teamTargets;
            return (
              <li
                key={photo.id}
                className={`relative rounded-xl border bg-white dark:bg-gray-900 p-2 ${
                  photo.error
                    ? "border-red-400 dark:border-red-700"
                    : doubled
                      ? "border-amber-400 dark:border-amber-600"
                      : "border-gray-200 dark:border-gray-800"
                }`}
              >
                <button
                  type="button"
                  onClick={() => openEnlarged(photo)}
                  disabled={!photo.blob}
                  aria-label={`View ${photo.fileName}`}
                  className="block w-full"
                >
                  {photo.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo.thumbUrl}
                      alt=""
                      className="aspect-[4/5] w-full rounded-lg bg-gray-100 object-cover dark:bg-gray-800"
                    />
                  ) : (
                    <span className="flex aspect-[4/5] w-full items-center justify-center rounded-lg bg-gray-100 px-2 text-center text-xs text-gray-400 dark:bg-gray-800">
                      {photo.status === "reading" ? (
                        <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                      ) : (
                        photo.fileName
                      )}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => removePhoto(photo)}
                  disabled={saving}
                  aria-label={`Remove ${photo.fileName}`}
                  className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-gray-900/70 text-xs text-white hover:bg-red-600 disabled:opacity-40"
                >
                  ✕
                </button>

                {photo.status !== "unreadable" && (
                  <select
                    value={photo.targetKey}
                    disabled={saving}
                    onChange={(e) => {
                      setSaveError(null);
                      patchPhoto(photo.id, {
                        targetKey: e.target.value,
                        matchedFromName: false,
                        pickCleared: !e.target.value,
                        error: undefined,
                      });
                    }}
                    aria-label={`Player for ${photo.fileName}`}
                    className={`mt-2 w-full rounded-lg border bg-white px-2 py-1.5 text-base font-medium dark:bg-gray-800 sm:text-xs ${
                      photo.targetKey
                        ? "border-gray-300 text-gray-900 dark:border-gray-600 dark:text-white"
                        : "border-blue-400 text-gray-500 dark:border-blue-600 dark:text-gray-300"
                    }`}
                  >
                    <option value="">Who is this?</option>
                    {options.map((t) => (
                      <option key={t.key} value={t.key}>
                        {pickCounts.has(t.key) && t.key !== photo.targetKey ? "✓ " : ""}
                        {t.name}
                        {teamId && t.teamId === teamId ? "" : ` · ${t.teamName ?? "No team"}`}
                      </option>
                    ))}
                  </select>
                )}

                {photo.error ? (
                  <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{photo.error}</p>
                ) : doubled ? (
                  <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                    Also picked on another photo
                  </p>
                ) : hasDraft ? (
                  <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                    Already has a draft
                  </p>
                ) : photo.matchedFromName ? (
                  <p className="mt-1 text-[11px] text-gray-400">Matched from file name</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {hasUnsaved && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-950/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold text-gray-900 dark:text-white">
                {progress ?? `${ready.length} of ${savablePhotos} matched`}
              </p>
              {saveError ? (
                <p className="text-xs text-red-600 dark:text-red-400">{saveError}</p>
              ) : (
                !progress &&
                unmatched > 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {unmatched} still need a player and will stay here.
                  </p>
                )
              )}
            </div>
            <button
              type="button"
              onClick={saveDrafts}
              disabled={saving || reading || ready.length === 0}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving
                ? "Saving…"
                : reading
                  ? "Reading photos…"
                  : `Save ${ready.length} draft${ready.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}

      {enlarged && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={closeEnlarged}
        >
          <button
            type="button"
            onClick={closeEnlarged}
            aria-label="Close"
            className="absolute right-4 top-4 text-2xl leading-none text-white"
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enlarged.url}
            alt={enlarged.name}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        </div>
      )}
    </div>
  );
}
