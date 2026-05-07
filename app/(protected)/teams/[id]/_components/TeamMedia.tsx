"use client";

import { useState, useRef, useTransition } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { saveTeamMedia, setTeamPhoto, deleteTeamMedia, updateMediaCaption } from "../../media-actions";

type MediaItem = {
  id: string;
  public_url: string;
  storage_path: string;
  media_type: "photo" | "video";
  is_team_photo: boolean;
  caption: string | null;
};

function uid() { return crypto.randomUUID(); }
function ext(name: string) {
  const p = name.split(".");
  return p.length > 1 ? p[p.length - 1].toLowerCase() : "bin";
}

// ── Upload drop zone ──────────────────────────────────────────

function UploadZone({ onUploaded, teamId }: { onUploaded: (item: MediaItem) => void; teamId: string }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  async function handleFiles(files: File[]) {
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not authenticated"); return; }

    setUploading(true);
    for (const file of files) {
      const isVideo = file.type.startsWith("video/");
      const path = `${user.id}/${uid()}.${ext(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from("team-media")
        .upload(path, file, { upsert: false });

      if (upErr) { setError(upErr.message); setUploading(false); return; }

      const { data: urlData } = supabase.storage.from("team-media").getPublicUrl(path);
      const result = await saveTeamMedia({
        teamId,
        storagePath: path,
        publicUrl: urlData.publicUrl,
        mediaType: isVideo ? "video" : "photo",
      });

      if (result.error) { setError(result.error); setUploading(false); return; }

      onUploaded({
        id: uid(),
        public_url: urlData.publicUrl,
        storage_path: path,
        media_type: isVideo ? "video" : "photo",
        is_team_photo: false,
        caption: null,
      });
    }
    setUploading(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    handleFiles(Array.from(e.dataTransfer.files));
  }

  return (
    <div>
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => ref.current?.click()}
        className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl px-6 py-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Uploading…
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400">Click or drag to upload photos or videos</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">JPG, PNG, MP4, MOV — multiple files OK</p>
          </>
        )}
        <input
          ref={ref}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(Array.from(e.target.files ?? []))}
        />
      </div>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </div>
  );
}

// ── Single media card ─────────────────────────────────────────

function MediaCard({
  item,
  teamId,
  onSetTeamPhoto,
  onDelete,
  onCaptionSave,
}: {
  item: MediaItem;
  teamId: string;
  onSetTeamPhoto: (id: string) => void;
  onDelete: (id: string) => void;
  onCaptionSave: (id: string, caption: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState(item.caption ?? "");

  function handleSetTeamPhoto() {
    startTransition(async () => {
      await setTeamPhoto(item.id, teamId);
      onSetTeamPhoto(item.id);
    });
  }

  function handleDelete() {
    if (!confirm("Delete this media item?")) return;
    startTransition(async () => {
      await deleteTeamMedia(item.id, item.storage_path, teamId);
      onDelete(item.id);
    });
  }

  function handleCaptionSave() {
    startTransition(async () => {
      await updateMediaCaption(item.id, captionDraft, teamId);
      onCaptionSave(item.id, captionDraft);
      setEditingCaption(false);
    });
  }

  return (
    <div className={`relative rounded-xl overflow-hidden border ${item.is_team_photo ? "border-blue-400 dark:border-blue-500" : "border-gray-200 dark:border-gray-700"} ${pending ? "opacity-50" : ""}`}>
      {/* Media preview */}
      <div className="relative aspect-[4/3] bg-gray-100 dark:bg-gray-800">
        {item.media_type === "video" ? (
          <video
            src={item.public_url}
            className="w-full h-full object-cover"
            controls={false}
            muted
            playsInline
            preload="metadata"
            onClick={(e) => {
              const v = e.currentTarget;
              v.controls = true;
              v.play();
            }}
          />
        ) : (
          <Image
            src={item.public_url}
            alt={item.caption ?? "Team media"}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 50vw, 33vw"
          />
        )}

        {item.is_team_photo && (
          <span className="absolute top-2 left-2 bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            TEAM PHOTO
          </span>
        )}
        {item.media_type === "video" && (
          <span className="absolute top-2 right-2 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            VIDEO
          </span>
        )}

        {/* Delete */}
        <button
          onClick={handleDelete}
          disabled={pending}
          className="absolute bottom-2 right-2 bg-black/50 hover:bg-red-600/80 text-white text-xs font-semibold w-6 h-6 rounded-full flex items-center justify-center transition-colors"
          title="Delete"
        >
          ×
        </button>
      </div>

      {/* Caption + actions */}
      <div className="px-2 py-1.5 space-y-1">
        {editingCaption ? (
          <div className="flex gap-1">
            <input
              autoFocus
              value={captionDraft}
              onChange={(e) => setCaptionDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCaptionSave(); if (e.key === "Escape") setEditingCaption(false); }}
              className="flex-1 text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
              placeholder="Add caption…"
            />
            <button onClick={handleCaptionSave} disabled={pending} className="text-xs text-blue-600 hover:underline px-1">Save</button>
          </div>
        ) : (
          <button
            onClick={() => setEditingCaption(true)}
            className="text-xs text-left text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 truncate w-full"
          >
            {item.caption ?? "Add caption…"}
          </button>
        )}

        {!item.is_team_photo && item.media_type === "photo" && (
          <button
            onClick={handleSetTeamPhoto}
            disabled={pending}
            className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40"
          >
            Set as team photo
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

export default function TeamMedia({
  initialMedia,
  teamId,
}: {
  initialMedia: MediaItem[];
  teamId: string;
}) {
  const [media, setMedia] = useState<MediaItem[]>(initialMedia);

  const teamPhoto = media.find((m) => m.is_team_photo);
  const gallery = media.filter((m) => !m.is_team_photo);

  function handleUploaded(item: MediaItem) {
    setMedia((prev) => [item, ...prev]);
  }

  function handleSetTeamPhoto(id: string) {
    setMedia((prev) => prev.map((m) => ({ ...m, is_team_photo: m.id === id })));
  }

  function handleDelete(id: string) {
    setMedia((prev) => prev.filter((m) => m.id !== id));
  }

  function handleCaptionSave(id: string, caption: string) {
    setMedia((prev) => prev.map((m) => m.id === id ? { ...m, caption: caption || null } : m));
  }

  return (
    <div className="space-y-6">
      <UploadZone teamId={teamId} onUploaded={handleUploaded} />

      {/* Team photo */}
      {teamPhoto && (
        <section>
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Team photo</h3>
          <div className="max-w-xs">
            <MediaCard
              item={teamPhoto}
              teamId={teamId}
              onSetTeamPhoto={handleSetTeamPhoto}
              onDelete={handleDelete}
              onCaptionSave={handleCaptionSave}
            />
          </div>
        </section>
      )}

      {/* Gallery */}
      {gallery.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
            Gallery ({gallery.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {gallery.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                teamId={teamId}
                onSetTeamPhoto={handleSetTeamPhoto}
                onDelete={handleDelete}
                onCaptionSave={handleCaptionSave}
              />
            ))}
          </div>
        </section>
      )}

      {media.length === 0 && (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
          No media yet — upload a team photo or season gallery above.
        </p>
      )}
    </div>
  );
}
