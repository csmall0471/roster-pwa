"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import { toPng } from "html-to-image";
import { createClient } from "@/lib/supabase/client";
import {
  removeBackground,
  generateScoutingReport,
  findLookalike,
} from "@/app/actions/cardgen";
import { savePlayerPhoto } from "@/app/(protected)/players/photo-actions";
import { TEMPLATES, getTemplate, type Template } from "./templates";
import CardBack, { type BackStats } from "./CardBack";
import type { CardDesign, CardBackDesign } from "@/lib/types";

// ── Types ────────────────────────────────────────────────────

type Step = "upload" | "processing" | "edit" | "saving" | "saved";
type BgChoice =
  | { type: "template"; id: string }
  | { type: "image"; url: string };

type Props = {
  playerId: string;
  teamId: string | null;
  teamName: string;
  ageGroup: string | null;
  season: string | null;
  firstName: string;
  lastName: string;
  jersey: string | null;
  playerAge: string | null;
  returnHref: string;
  initialDesign?: CardDesign | null;
};

const EMPTY_STATS: BackStats = {
  position: "",
  height: "",
  jersey: "",
  hand: "",
  favorite_team: "",
  favorite_player: "",
  signature_move: "",
  age: "",
};

// ── Helpers ───────────────────────────────────────────────────

function fileExt(name: string) {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "jpg";
}

// ── Component ─────────────────────────────────────────────────

export default function CardEditor({
  playerId,
  teamId,
  teamName,
  ageGroup,
  season,
  firstName,
  lastName,
  jersey,
  playerAge,
  returnHref,
  initialDesign,
}: Props) {
  const router = useRouter();

  const [step, setStep] = useState<Step>(
    initialDesign?.cutout_url ? "edit" : "upload"
  );
  const [error, setError] = useState<string | null>(null);

  // Layer state
  const [cutoutUrl, setCutoutUrl] = useState<string | null>(
    initialDesign?.cutout_url ?? null
  );
  // Data-URL mirror of the cutout so html-to-image rasterizes deterministically
  // (cross-origin <img> elements sometimes race the rasterizer and snapshot blank).
  const [cutoutDataUrl, setCutoutDataUrl] = useState<string | null>(null);
  const [bg, setBg] = useState<BgChoice>(
    initialDesign?.background ?? { type: "template", id: TEMPLATES[0].id }
  );
  // Transform stored as fractions of stage dimensions so it scales across screen sizes.
  const [tx, setTx] = useState(initialDesign?.transform.x ?? 0);
  const [ty, setTy] = useState(initialDesign?.transform.y ?? 0);
  const [scale, setScale] = useState(initialDesign?.transform.scale ?? 1);

  const [teamText, setTeamText] = useState(
    initialDesign?.text.team_name ?? teamName.toUpperCase()
  );
  const [ageText, setAgeText] = useState(
    initialDesign?.text.age_group ?? ageGroup ?? ""
  );
  const [seasonText, setSeasonText] = useState(
    initialDesign?.text.season ?? season ?? ""
  );
  const [nameL1, setNameL1] = useState(
    initialDesign?.text.name_line1 ?? firstName.toUpperCase()
  );
  const [nameL2, setNameL2] = useState(
    initialDesign?.text.name_line2 ?? lastName.toUpperCase()
  );
  const [colorScheme, setColorScheme] = useState<"light" | "dark">(
    initialDesign?.text.color_scheme ?? "light"
  );

  const [tab, setTab] = useState<"photo" | "bg" | "text">("photo");
  const [side, setSide] = useState<"front" | "back">("front");

  // Back-side state — pre-seeded from any saved design, then from roster defaults.
  const initBack = initialDesign?.back;
  const [stats, setStats] = useState<BackStats>(() => ({
    ...EMPTY_STATS,
    jersey: jersey ?? "",
    age: playerAge ?? "",
    ...initBack?.stats,
  }));
  const [scoutingReport, setScoutingReport] = useState(
    initBack?.scouting_report ?? ""
  );
  const [lookAlike, setLookAlike] = useState(initBack?.look_alike ?? "");
  const [aiPending, setAiPending] = useState<null | "scouting" | "lookalike">(
    null
  );

  const stageRef = useRef<HTMLDivElement>(null);
  const backStageRef = useRef<HTMLDivElement>(null);
  const cutoutImgRef = useRef<HTMLImageElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);

  function patchStats(patch: Partial<BackStats>) {
    setStats((s) => ({ ...s, ...patch }));
  }

  // Whenever the cutout source changes, materialize it into a data URL.
  useEffect(() => {
    if (!cutoutUrl) {
      setCutoutDataUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(cutoutUrl);
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          if (!cancelled) setCutoutDataUrl(reader.result as string);
        };
        reader.readAsDataURL(blob);
      } catch {
        // Fall back to using the remote URL directly; export may still work.
        if (!cancelled) setCutoutDataUrl(cutoutUrl);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cutoutUrl]);

  // ── Drag / pinch ────────────────────────────────────────────

  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const dragStart = useRef<{
    tx: number;
    ty: number;
    scale: number;
    px: number;
    py: number;
    dist?: number;
  } | null>(null);

  function stageSize() {
    const r = stageRef.current?.getBoundingClientRect();
    return { w: r?.width ?? 1, h: r?.height ?? 1 };
  }

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...pointers.current.values()];
      if (pts.length === 1) {
        dragStart.current = {
          tx,
          ty,
          scale,
          px: pts[0].x,
          py: pts[0].y,
        };
      } else if (pts.length === 2) {
        const dx = pts[0].x - pts[1].x;
        const dy = pts[0].y - pts[1].y;
        dragStart.current = {
          tx,
          ty,
          scale,
          px: (pts[0].x + pts[1].x) / 2,
          py: (pts[0].y + pts[1].y) / 2,
          dist: Math.hypot(dx, dy),
        };
      }
    },
    [tx, ty, scale]
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!dragStart.current) return;
    const pts = [...pointers.current.values()];
    const { w, h } = stageSize();
    if (pts.length === 1) {
      const dx = (pts[0].x - dragStart.current.px) / w;
      const dy = (pts[0].y - dragStart.current.py) / h;
      setTx(dragStart.current.tx + dx);
      setTy(dragStart.current.ty + dy);
    } else if (pts.length === 2 && dragStart.current.dist) {
      const dist = Math.hypot(
        pts[0].x - pts[1].x,
        pts[0].y - pts[1].y
      );
      const ratio = dist / dragStart.current.dist;
      setScale(
        Math.max(0.2, Math.min(3, dragStart.current.scale * ratio))
      );
    }
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) dragStart.current = null;
  }, []);

  // ── Photo upload + bg-removal ──────────────────────────────

  async function handlePhotoSelected(file: File) {
    setStep("processing");
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const path = `${user.id}/cardgen-src/${crypto.randomUUID()}.${fileExt(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from("player-photos")
        .upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage
        .from("player-photos")
        .getPublicUrl(path);

      const result = await removeBackground(urlData.publicUrl);
      if (result.error) throw new Error(result.error);

      setCutoutUrl(result.cutoutUrl!);
      setTx(0);
      setTy(0);
      setScale(1);
      setStep("edit");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("upload");
    }
  }

  async function handleBgImageSelected(file: File) {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const path = `${user.id}/cardgen-bg/${crypto.randomUUID()}.${fileExt(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from("player-photos")
        .upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage
        .from("player-photos")
        .getPublicUrl(path);
      setBg({ type: "image", url: urlData.publicUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // ── AI helpers (back side) ──────────────────────────────────

  async function handleGenerateScouting() {
    if (!cutoutUrl) return;
    setAiPending("scouting");
    setError(null);
    try {
      const res = await generateScoutingReport({
        photoUrl: cutoutUrl,
        firstName,
        stats: {
          position: stats.position,
          height: stats.height,
          favorite_team: stats.favorite_team,
          favorite_player: stats.favorite_player,
          signature_move: stats.signature_move,
        },
      });
      if (res.error) throw new Error(res.error);
      if (res.report) setScoutingReport(res.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiPending(null);
    }
  }

  async function handleFindLookalike() {
    if (!cutoutUrl) return;
    setAiPending("lookalike");
    setError(null);
    try {
      const res = await findLookalike(cutoutUrl);
      if (res.error) throw new Error(res.error);
      if (res.name) setLookAlike(res.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiPending(null);
    }
  }

  // ── Save ────────────────────────────────────────────────────

  async function handleSave() {
    if (!stageRef.current || !cutoutUrl) return;
    setStep("saving");
    setError(null);
    try {
      // Wait for fonts so html-to-image captures Anton correctly.
      if ("fonts" in document) await (document as Document).fonts.ready;

      // Wait for the cutout image to be fully decoded before snapshotting,
      // otherwise the rasterizer can race and emit a card with no player.
      if (cutoutImgRef.current) {
        try {
          await cutoutImgRef.current.decode();
        } catch {
          if (!cutoutImgRef.current.complete) {
            await new Promise<void>((resolve) => {
              const img = cutoutImgRef.current!;
              const done = () => {
                img.removeEventListener("load", done);
                img.removeEventListener("error", done);
                resolve();
              };
              img.addEventListener("load", done);
              img.addEventListener("error", done);
            });
          }
        }
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // ── Rasterize front ─────────────────────────────────────
      const frontRect = stageRef.current.getBoundingClientRect();
      const frontPixelRatio = Math.max(1, 1050 / frontRect.width);
      const frontDataUrl = await toPng(stageRef.current, {
        pixelRatio: frontPixelRatio,
        backgroundColor: "#000",
      });
      const frontBlob = await (await fetch(frontDataUrl)).blob();
      const frontId = crypto.randomUUID();
      const frontPath = `${user.id}/cards/${frontId}.png`;
      const { error: frontUpErr } = await supabase.storage
        .from("player-photos")
        .upload(frontPath, frontBlob, {
          contentType: "image/png",
          upsert: false,
        });
      if (frontUpErr) throw frontUpErr;
      const { data: frontUrlData } = supabase.storage
        .from("player-photos")
        .getPublicUrl(frontPath);

      // ── Rasterize back (only if there's any back content) ──
      let backStoragePath: string | undefined;
      let backPublicUrl: string | undefined;
      if (backStageRef.current && hasBackContent) {
        const backRect = backStageRef.current.getBoundingClientRect();
        const backPixelRatio = Math.max(1, 1050 / backRect.width);
        const backDataUrl = await toPng(backStageRef.current, {
          pixelRatio: backPixelRatio,
          backgroundColor: "#000",
        });
        const backBlob = await (await fetch(backDataUrl)).blob();
        backStoragePath = `${user.id}/cards/${frontId}-back.png`;
        const { error: backUpErr } = await supabase.storage
          .from("player-photos")
          .upload(backStoragePath, backBlob, {
            contentType: "image/png",
            upsert: false,
          });
        if (backUpErr) throw backUpErr;
        const { data: backUrlData } = supabase.storage
          .from("player-photos")
          .getPublicUrl(backStoragePath);
        backPublicUrl = backUrlData.publicUrl;
      }

      const backDesign: CardBackDesign | undefined = hasBackContent
        ? {
            stats,
            scouting_report: scoutingReport,
            look_alike: lookAlike,
          }
        : undefined;

      const design: CardDesign = {
        cutout_url: cutoutUrl,
        background: bg,
        transform: { x: tx, y: ty, scale },
        text: {
          team_name: teamText,
          age_group: ageText || null,
          season: seasonText || null,
          name_line1: nameL1,
          name_line2: nameL2,
          color_scheme: colorScheme,
        },
        ...(backDesign ? { back: backDesign } : {}),
      };

      const res = await savePlayerPhoto({
        playerId,
        storagePath: frontPath,
        publicUrl: frontUrlData.publicUrl,
        backStoragePath,
        backPublicUrl,
        teamName: teamText,
        season: seasonText || season || undefined,
        teamId: teamId ?? undefined,
        cardDesign: design,
      });
      if (res.error) throw new Error(res.error);

      setStep("saved");
      router.push(returnHref);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("edit");
    }
  }

  const hasBackContent =
    Object.values(stats).some((v) => v.trim().length > 0) ||
    scoutingReport.trim().length > 0 ||
    lookAlike.trim().length > 0;

  // ── Derived style ───────────────────────────────────────────

  const template: Template | null =
    bg.type === "template" ? getTemplate(bg.id) : null;
  const effectiveColorScheme: "light" | "dark" =
    bg.type === "template" ? template!.textColor : colorScheme;

  const bgStyle: CSSProperties =
    bg.type === "template"
      ? template!.style
      : {
          backgroundImage: `url(${bg.url})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        };

  const isLight = effectiveColorScheme === "light";
  const titleColor = isLight ? "#fff" : "#111";
  const titleShadow = isLight
    ? "0 2px 8px rgba(0,0,0,0.45)"
    : "0 1px 0 rgba(255,255,255,0.15)";

  // ── Render ──────────────────────────────────────────────────

  if (step === "upload") {
    return (
      <div className="max-w-md mx-auto">
        {error && (
          <p className="text-sm text-red-500 dark:text-red-400 mb-3">{error}</p>
        )}
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl px-6 py-16 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
        >
          <div className="text-5xl mb-3">📸</div>
          <p className="text-base font-semibold text-gray-700 dark:text-gray-200">
            Pick a photo of {firstName}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            We&apos;ll remove the background and you can build the card.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handlePhotoSelected(f);
            }}
          />
        </div>
      </div>
    );
  }

  if (step === "processing") {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <div className="w-10 h-10 mx-auto border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
          Removing background…
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Takes about 5 seconds.
        </p>
      </div>
    );
  }

  const fullName = [nameL1, nameL2].filter(Boolean).join(" ");

  return (
    <div className="max-w-md mx-auto">
      {error && (
        <p className="text-sm text-red-500 dark:text-red-400 mb-3">{error}</p>
      )}

      {/* Side toggle */}
      <div className="flex gap-1 mb-3 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
        {(["front", "back"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`flex-1 py-1.5 text-xs font-semibold uppercase tracking-wide rounded-md transition-colors ${
              side === s
                ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Stage container — both sides rendered; inactive is offscreen but rasterizable. */}
      <div className="relative w-full">
        {/* Back stage (offscreen when not active) */}
        <div
          style={
            side === "back"
              ? undefined
              : { position: "absolute", left: -99999, top: 0, width: "100%" }
          }
        >
          <CardBack
            ref={backStageRef}
            bgStyle={bgStyle}
            teamText={teamText}
            ageText={ageText}
            seasonText={seasonText}
            playerName={fullName}
            jersey={stats.jersey}
            stats={stats}
            scoutingReport={scoutingReport}
            lookAlike={lookAlike}
          />
        </div>

        {/* Front stage */}
        <div
          ref={stageRef}
          className="relative w-full mx-auto rounded-2xl overflow-hidden select-none touch-none shadow-lg"
          style={
            side === "front"
              ? { aspectRatio: "5 / 7", ...bgStyle }
              : {
                  aspectRatio: "5 / 7",
                  ...bgStyle,
                  position: "absolute",
                  left: -99999,
                  top: 0,
                }
          }
        >
        {/* Cutout (draggable) — uses data URL so html-to-image can embed it deterministically. */}
        {cutoutDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={cutoutImgRef}
            src={cutoutDataUrl}
            alt=""
            draggable={false}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              transform: `translate(${tx * 100}%, ${ty * 100}%) scale(${scale})`,
              transformOrigin: "center center",
              cursor: "grab",
              touchAction: "none",
            }}
          />
        )}

        {/* Team name plate — stacked chevron-cut chips. */}
        <div
          style={{
            position: "absolute",
            top: "5%",
            left: 0,
            pointerEvents: "none",
            filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.45))",
          }}
        >
          <div
            style={{
              background: "#fff",
              color: "#0a0a0a",
              padding: "0.38em 1.6em 0.38em 5%",
              clipPath:
                "polygon(0 0, 100% 0, calc(100% - 0.8em) 100%, 0 100%)",
              fontFamily: "var(--font-anton), Impact, sans-serif",
              fontSize: "min(7vw, 38px)",
              letterSpacing: "0.04em",
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            {teamText || "TEAM"}
          </div>
          {(ageText || seasonText) && (
            <div
              style={{
                background: "#0a0a0a",
                color: "#fff",
                padding: "0.45em 1.6em 0.45em 5%",
                clipPath:
                  "polygon(0 0, 100% 0, calc(100% - 0.7em) 100%, 0 100%)",
                fontFamily:
                  "var(--font-geist-sans), system-ui, sans-serif",
                fontSize: "min(2.7vw, 14px)",
                letterSpacing: "0.22em",
                fontWeight: 700,
                marginTop: "-1px",
                whiteSpace: "nowrap",
              }}
            >
              {[ageText, seasonText].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>

        {/* Player name */}
        <div
          style={{
            position: "absolute",
            left: "5%",
            right: "5%",
            bottom: "5%",
            pointerEvents: "none",
            fontFamily: "var(--font-anton), Impact, sans-serif",
            color: titleColor,
            textShadow: titleShadow,
            lineHeight: 0.92,
            letterSpacing: "0.01em",
          }}
        >
          <div style={{ fontSize: "min(11vw, 64px)" }}>{nameL1}</div>
          <div style={{ fontSize: "min(11vw, 64px)", marginTop: "2%" }}>
            {nameL2}
          </div>
        </div>
        </div>
      </div>

      {/* Toolbar — different content for front vs back. */}
      <div className="mt-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {side === "front" && (
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {(["photo", "bg", "text"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
                tab === t
                  ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              {t === "bg" ? "Background" : t}
            </button>
          ))}
        </div>
        )}

        {side === "front" && (
        <div className="p-3">
          {tab === "photo" && (
            <div className="space-y-3">
              <label className="block text-xs text-gray-500 dark:text-gray-400">
                Size: {Math.round(scale * 100)}%
              </label>
              <input
                type="range"
                min={0.3}
                max={2.5}
                step={0.01}
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setTx(0);
                    setTy(0);
                    setScale(1);
                  }}
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Recenter
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Replace photo
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handlePhotoSelected(f);
                  }}
                />
              </div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                Drag the player on the card to move. Pinch to scale on phones.
              </p>
            </div>
          )}

          {tab === "bg" && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setBg({ type: "template", id: t.id })}
                    className={`aspect-square rounded-lg border-2 transition-all ${
                      bg.type === "template" && bg.id === t.id
                        ? "border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800"
                        : "border-transparent"
                    }`}
                    style={t.style}
                    aria-label={t.name}
                  />
                ))}
              </div>
              <button
                onClick={() => bgFileRef.current?.click()}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Upload your own background
              </button>
              <input
                ref={bgFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleBgImageSelected(f);
                }}
              />
              {bg.type === "image" && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Custom background
                  </span>
                  <label className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
                    Text:
                  </label>
                  <select
                    value={colorScheme}
                    onChange={(e) =>
                      setColorScheme(e.target.value as "light" | "dark")
                    }
                    className="text-xs border border-gray-200 dark:border-gray-600 rounded px-1.5 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {tab === "text" && (
            <div className="space-y-2">
              <Field label="Team name">
                <input
                  value={teamText}
                  onChange={(e) => setTeamText(e.target.value)}
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Age">
                  <input
                    value={ageText}
                    onChange={(e) => setAgeText(e.target.value)}
                    placeholder="8U"
                    className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  />
                </Field>
                <Field label="Season">
                  <input
                    value={seasonText}
                    onChange={(e) => setSeasonText(e.target.value)}
                    placeholder="Fall 2025"
                    className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  />
                </Field>
              </div>
              <Field label="Name line 1">
                <input
                  value={nameL1}
                  onChange={(e) => setNameL1(e.target.value)}
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </Field>
              <Field label="Name line 2">
                <input
                  value={nameL2}
                  onChange={(e) => setNameL2(e.target.value)}
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </Field>
            </div>
          )}
        </div>
        )}

        {side === "back" && (
          <div className="p-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Position">
                <select
                  value={stats.position}
                  onChange={(e) => patchStats({ position: e.target.value })}
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                >
                  <option value="">—</option>
                  <option value="GUARD">Guard</option>
                  <option value="FORWARD">Forward</option>
                  <option value="CENTER">Center</option>
                  <option value="UTILITY">Utility</option>
                </select>
              </Field>
              <Field label="Height">
                <input
                  value={stats.height}
                  onChange={(e) => patchStats({ height: e.target.value })}
                  placeholder={"4'2\""}
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </Field>
              <Field label="Jersey #">
                <input
                  value={stats.jersey}
                  onChange={(e) => patchStats({ jersey: e.target.value })}
                  placeholder="7"
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </Field>
              <Field label="Shooting hand">
                <select
                  value={stats.hand}
                  onChange={(e) => patchStats({ hand: e.target.value })}
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                >
                  <option value="">—</option>
                  <option value="RIGHT">Right</option>
                  <option value="LEFT">Left</option>
                  <option value="BOTH">Both</option>
                </select>
              </Field>
              <Field label="Age">
                <input
                  value={stats.age}
                  onChange={(e) => patchStats({ age: e.target.value })}
                  placeholder="8"
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </Field>
              <Field label="Fav NBA team">
                <input
                  value={stats.favorite_team}
                  onChange={(e) =>
                    patchStats({ favorite_team: e.target.value })
                  }
                  placeholder="Suns"
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </Field>
              <Field label="Fav NBA player">
                <input
                  value={stats.favorite_player}
                  onChange={(e) =>
                    patchStats({ favorite_player: e.target.value })
                  }
                  placeholder="Curry"
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </Field>
              <Field label="Signature move">
                <input
                  value={stats.signature_move}
                  onChange={(e) =>
                    patchStats({ signature_move: e.target.value })
                  }
                  placeholder="Step-back"
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </Field>
            </div>

            <Field label="Scouting report">
              <textarea
                value={scoutingReport}
                onChange={(e) => setScoutingReport(e.target.value)}
                rows={3}
                placeholder="Coach quote, parent note, or scouting blurb…"
                className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-none"
              />
              <button
                onClick={handleGenerateScouting}
                disabled={aiPending !== null}
                className="mt-1 text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
              >
                {aiPending === "scouting"
                  ? "Writing…"
                  : "✨ Generate with AI"}
              </button>
            </Field>

            <Field label="Plays like">
              <input
                value={lookAlike}
                onChange={(e) => setLookAlike(e.target.value)}
                placeholder="Stephen Curry"
                className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
              <button
                onClick={handleFindLookalike}
                disabled={aiPending !== null}
                className="mt-1 text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
              >
                {aiPending === "lookalike"
                  ? "Matching…"
                  : "✨ Find a match"}
              </button>
            </Field>
          </div>
        )}
      </div>

      {/* Save */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => router.push(returnHref)}
          className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!cutoutUrl || step === "saving"}
          className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {step === "saving" ? "Saving…" : "Save card"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
