"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { matchCardToPlayer, savePlayerPhoto } from "../photo-actions";

// ── Types ────────────────────────────────────────────────────

type CardStatus = "idle" | "uploading" | "extracting" | "ready" | "saving" | "saved" | "error";

type CardState = {
  id: string;
  file: File;
  previewUrl: string;
  status: CardStatus;
  storagePath: string | null;
  publicUrl: string | null;
  extraction: { first_name: string; last_name: string; team_name: string; season: string } | null;
  matchedPlayerId: string | null;
  matchedPlayerName: string | null;
  confidence: "exact" | "partial" | "none" | null;
  overridePlayerId: string | null;
  error: string | null;
};

// ── Helpers ──────────────────────────────────────────────────

function uid() {
  return crypto.randomUUID();
}

function ext(filename: string) {
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "jpg";
}

// ── Component ────────────────────────────────────────────────

export default function UploadCardsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetPlayerId = searchParams.get("player"); // set when coming from a player detail page

  const [cards, setCards] = useState<CardState[]>([]);
  const [allPlayers, setAllPlayers] = useState<{ id: string; first_name: string; last_name: string }[]>([]);
  const [playersLoaded, setPlayersLoaded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load player list once so dropdowns work
  async function ensurePlayers() {
    if (playersLoaded) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("players")
      .select("id, first_name, last_name")
      .order("last_name");
    setAllPlayers(data ?? []);
    setPlayersLoaded(true);
  }

  function updateCard(id: string, patch: Partial<CardState>) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  // Pick files → build initial state
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const newCards: CardState[] = files.map((file) => ({
      id: uid(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: "idle",
      storagePath: null,
      publicUrl: null,
      extraction: null,
      matchedPlayerId: presetPlayerId ?? null,
      matchedPlayerName: null,
      confidence: presetPlayerId ? "exact" : null,
      overridePlayerId: null,
      error: null,
    }));
    setCards((prev) => [...prev, ...newCards]);
    ensurePlayers();
  }

  // Process one card: upload → AI extract → match
  const processCard = useCallback(
    async (card: CardState) => {
      const supabase = createClient();
      updateCard(card.id, { status: "uploading", error: null });

      // 1. Upload to Supabase Storage
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        updateCard(card.id, { status: "error", error: "Not authenticated" });
        return;
      }

      const path = `${user.id}/${uid()}.${ext(card.file.name)}`;
      const { error: uploadErr } = await supabase.storage
        .from("player-photos")
        .upload(path, card.file, { upsert: false });

      if (uploadErr) {
        updateCard(card.id, { status: "error", error: uploadErr.message });
        return;
      }

      const { data: urlData } = supabase.storage
        .from("player-photos")
        .getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      updateCard(card.id, { storagePath: path, publicUrl, status: "extracting" });

      // 2. AI extraction + matching (skip if player is already set via presetPlayerId)
      if (presetPlayerId) {
        const preset = allPlayers.find((p) => p.id === presetPlayerId);
        updateCard(card.id, {
          status: "ready",
          matchedPlayerId: presetPlayerId,
          matchedPlayerName: preset
            ? `${preset.first_name} ${preset.last_name}`
            : "Selected player",
          confidence: "exact",
        });
        return;
      }

      try {
        const match = await matchCardToPlayer(publicUrl);
        updateCard(card.id, {
          status: "ready",
          extraction: match.extraction,
          matchedPlayerId: match.player_id,
          matchedPlayerName: match.player_name,
          confidence: match.confidence,
        });
      } catch {
        updateCard(card.id, {
          status: "ready",
          extraction: null,
          matchedPlayerId: null,
          matchedPlayerName: null,
          confidence: "none",
          error: "AI extraction failed — please assign manually.",
        });
      }
    },
    [presetPlayerId, allPlayers]
  );

  async function processAll() {
    const idle = cards.filter((c) => c.status === "idle");
    for (const card of idle) {
      await processCard(card);
    }
  }

  async function saveCard(card: CardState) {
    const pid = card.overridePlayerId ?? card.matchedPlayerId;
    if (!pid || !card.publicUrl || !card.storagePath) return;

    updateCard(card.id, { status: "saving" });
    const result = await savePlayerPhoto({
      playerId: pid,
      storagePath: card.storagePath,
      publicUrl: card.publicUrl,
      teamName: card.extraction?.team_name,
      season: card.extraction?.season,
    });

    if (result.error) {
      updateCard(card.id, { status: "error", error: result.error });
    } else {
      updateCard(card.id, { status: "saved" });
    }
  }

  async function saveAll() {
    const ready = cards.filter(
      (c) => c.status === "ready" && (c.overridePlayerId ?? c.matchedPlayerId)
    );
    await Promise.all(ready.map(saveCard));
  }

  const idleCount = cards.filter((c) => c.status === "idle").length;
  const readyCount = cards.filter(
    (c) => c.status === "ready" && (c.overridePlayerId ?? c.matchedPlayerId)
  ).length;
  const savedCount = cards.filter((c) => c.status === "saved").length;
  const processing = cards.some((c) => c.status === "uploading" || c.status === "extracting");

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link
          href={presetPlayerId ? `/players/${presetPlayerId}` : "/players"}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          ← Back
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-3">Upload season cards</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {presetPlayerId
            ? "Adding a card to this player."
            : "Pick multiple cards — Claude will read each name and match it to a player."}
        </p>
      </div>

      {/* File picker */}
      <div
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl px-6 py-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors mb-6"
      >
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Click to select card images, or drag &amp; drop
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">JPG, PNG — select multiple at once</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {cards.length > 0 && (
        <>
          {/* Action bar */}
          <div className="flex items-center gap-3 mb-4">
            {idleCount > 0 && (
              <button
                onClick={processAll}
                disabled={processing}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {processing ? "Processing…" : `Process ${idleCount} card${idleCount !== 1 ? "s" : ""}`}
              </button>
            )}
            {readyCount > 0 && (
              <button
                onClick={saveAll}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
              >
                Save {readyCount} matched card{readyCount !== 1 ? "s" : ""}
              </button>
            )}
            {savedCount > 0 && (
              <button
                onClick={() =>
                  presetPlayerId
                    ? router.push(`/players/${presetPlayerId}`)
                    : router.push("/players")
                }
                className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Done — view players →
              </button>
            )}
          </div>

          {/* Card grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {cards.map((card) => (
              <CardTile
                key={card.id}
                card={card}
                players={allPlayers}
                presetPlayerId={presetPlayerId}
                onProcess={() => processCard(card)}
                onOverride={(pid) => updateCard(card.id, { overridePlayerId: pid })}
                onSave={() => saveCard(card)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Individual card tile ──────────────────────────────────────

function CardTile({
  card,
  players,
  presetPlayerId,
  onProcess,
  onOverride,
  onSave,
}: {
  card: CardState;
  players: { id: string; first_name: string; last_name: string }[];
  presetPlayerId: string | null;
  onProcess: () => void;
  onOverride: (pid: string) => void;
  onSave: () => void;
}) {
  const assignedId = card.overridePlayerId ?? card.matchedPlayerId;
  const canSave = card.status === "ready" && !!assignedId;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Preview */}
      <div className="relative aspect-[5/7] bg-gray-100 dark:bg-gray-800">
        <Image
          src={card.previewUrl}
          alt="Card preview"
          fill
          className="object-cover"
          sizes="(max-width: 640px) 50vw, 33vw"
        />

        {/* Status overlay */}
        {(card.status === "uploading" || card.status === "extracting" || card.status === "saving") && (
          <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-1">
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <p className="text-white text-xs font-medium">
              {card.status === "uploading"
                ? "Uploading…"
                : card.status === "extracting"
                ? "Reading card…"
                : "Saving…"}
            </p>
          </div>
        )}

        {card.status === "saved" && (
          <div className="absolute inset-0 bg-green-600/80 flex items-center justify-center">
            <span className="text-white text-3xl">✓</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2.5 space-y-2">
        {card.status === "idle" && (
          <button
            onClick={onProcess}
            className="w-full text-xs text-blue-600 font-medium hover:underline text-left"
          >
            Process →
          </button>
        )}

        {card.status === "ready" && (
          <>
            {/* Extracted info */}
            {card.extraction && (
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                {[card.extraction.team_name, card.extraction.season]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}

            {/* Match result / override */}
            {!presetPlayerId && (
              <div>
                {card.confidence === "exact" && !card.overridePlayerId ? (
                  <p className="text-xs font-semibold text-green-700 dark:text-green-300 truncate">
                    ✓ {card.matchedPlayerName}
                  </p>
                ) : card.confidence === "partial" && !card.overridePlayerId ? (
                  <p className="text-xs font-medium text-amber-600 dark:text-amber-400 truncate">
                    ~{card.matchedPlayerName}
                  </p>
                ) : null}

                <select
                  value={card.overridePlayerId ?? card.matchedPlayerId ?? ""}
                  onChange={(e) => onOverride(e.target.value)}
                  className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded px-1.5 py-1 mt-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="">— assign player —</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.first_name} {p.last_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {card.error && (
              <p className="text-xs text-amber-600 dark:text-amber-400">{card.error}</p>
            )}

            {canSave && (
              <button
                onClick={onSave}
                className="w-full rounded bg-green-600 px-2 py-1 text-xs font-semibold text-white hover:bg-green-700 transition-colors"
              >
                Save
              </button>
            )}
          </>
        )}

        {card.status === "error" && (
          <p className="text-xs text-red-500 dark:text-red-400">{card.error}</p>
        )}

        {card.status === "saved" && (
          <p className="text-xs text-green-600 dark:text-green-400 font-semibold">Saved ✓</p>
        )}
      </div>
    </div>
  );
}
