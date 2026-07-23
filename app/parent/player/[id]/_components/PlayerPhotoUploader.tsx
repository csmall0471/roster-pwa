"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logClientActivity } from "@/app/actions/log-activity";
import { setPlayerPhoto } from "../actions";

// Downscale a phone photo to a sensible size before upload (long edge ≤ 1400px,
// JPEG) so storage stays small and the upload is quick.
async function downscale(file: File, max = 1400): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = document.createElement("img");
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("That file didn't look like an image."));
      img.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process that image."))), "image/jpeg", 0.9)
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function PlayerPhotoUploader({
  playerId,
  photoUrl,
  name,
}: {
  playerId: string;
  photoUrl: string | null;
  name: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setError(null);
    start(async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Please sign in again.");
        const blob = await downscale(file);
        // Parents can only write under their own uid prefix (bucket policy); the
        // DB row is recorded under the coach by setPlayerPhoto.
        const path = `${user.id}/profile/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("player-photos")
          .upload(path, blob, { contentType: "image/jpeg", upsert: false });
        if (upErr) throw new Error(upErr.message);
        const { data: urlData } = supabase.storage.from("player-photos").getPublicUrl(path);
        const res = await setPlayerPhoto(playerId, path, urlData.publicUrl);
        if (res.error) throw new Error(res.error);
        logClientActivity("player_photo_updated", { player_id: playerId }).catch(() => {});
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
      }
    });
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      {photoUrl ? (
        <Image
          src={photoUrl}
          alt={name}
          width={96}
          height={128}
          className="h-32 w-24 rounded-xl border border-gray-200 object-cover shadow-sm dark:border-gray-700"
        />
      ) : (
        <div className="flex h-32 w-24 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 text-3xl text-gray-300 dark:border-gray-700 dark:text-gray-600">
          👤
        </div>
      )}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
      >
        {busy ? "Uploading…" : photoUrl ? "Change photo" : "Add photo"}
      </button>
      {error && <p className="max-w-[7rem] text-center text-[11px] text-red-600 dark:text-red-400">{error}</p>}
      <input ref={fileRef} type="file" accept="image/*" onChange={onPick} className="hidden" />
    </div>
  );
}
