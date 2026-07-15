"use client";

import {
  useState,
  useRef,
  useEffect,
  type CSSProperties,
} from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { track } from "@vercel/analytics";
import { logClientActivity } from "@/app/actions/log-activity";
import { createClient } from "@/lib/supabase/client";
import {
  removeBackground,
  generateScoutingReport,
  findLookalike,
  type LookalikeOption,
} from "@/app/actions/cardgen";
import { savePlayerPhoto } from "@/app/(protected)/players/photo-actions";
import { saveCardDraft, deleteCardDraft } from "@/app/(protected)/tools/card-creator/draft-actions";
import { TEMPLATES, TEMPLATE_CATEGORIES, getTemplate, type Template } from "./templates";
import { compositeFrontCanvas } from "./card-raster";
import { NAME_FONTS, getNameFont } from "./name-fonts";
import CardBack, { type BackStats } from "./CardBack";
import SignaturePad, { type SignatureResult } from "./SignaturePad";
import {
  renderSignaturePng,
  DEFAULT_SIG_THICKNESS,
  type SigStroke,
} from "./signature-render";
import {
  compositeFront,
  compositeBack,
  compositeFoilMaskCanvas,
  coverIntoCanvas,
} from "./card-raster";
import { buildZip, type ZipEntry } from "./zip";
import type { CardDesign } from "@/lib/types";

// ── Types ────────────────────────────────────────────────────

type Step = "upload" | "processing" | "edit" | "saving" | "saved";
type BgChoice =
  | { type: "template"; id: string }
  | { type: "image"; url: string };

type Props = {
  playerId: string | null;
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
  // The player_photos row `initialDesign` came from. When set, saving edits that
  // card in place rather than adding a new one to the player.
  initialPhotoId?: string | null;
  // Standalone mode (Tools → Card Creator): no player to attach to, so the
  // finished card is exported to the photo library / downloaded instead of
  // saved against a player record.
  standalone?: boolean;
  // Players this principal may attach a standalone card to (owner → their
  // roster; parent → their kids). When present, the editor offers "save to a
  // player" alongside "save to photos".
  assignTargets?: AssignTarget[];
  // Owner-only: allow saving the card as a draft (player/team info typed in but
  // not attached to a real player). draftId is set when editing an existing one.
  allowDrafts?: boolean;
  draftId?: string;
  // Pre-selected assign target (a "playerId::teamId" key) when reopening a draft
  // that was earmarked for a kid, so publishing it is one tap.
  initialAssignKey?: string;
};

export type AssignTarget = {
  // Unique per player+team, so a kid on multiple teams shows once per team.
  key: string;
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  teamId: string | null;
  teamName: string | null;
  season: string | null;
  ageGroup: string | null;
  jersey: string | null;
  playerAge: string | null;
};

const EMPTY_STATS: BackStats = {
  position: "",
  height: "",
  jersey: "",
  age: "",
  favorite_team: "",
  favorite_player: "",
  signature_move: "",
  favorite_drill: "",
  biggest_fan: "",
  loudest_parent: "",
  hype_song: "",
  coach: "",
  assistant_coaches: "",
};

// Format a height as feet'inches" from whatever the user types. The first
// digit is feet, the next one or two are inches, so "42" → 4'2" and the ' / "
// marks appear on their own as they type.
function formatHeight(raw: string): string {
  const d = raw.replace(/[^\d]/g, "").slice(0, 3);
  if (!d) return "";
  return d.length === 1 ? `${d}'` : `${d[0]}'${d.slice(1)}"`;
}

// ── Helpers ───────────────────────────────────────────────────

function fileExt(name: string) {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "jpg";
}

// iPhone photos arrive with EXIF "rotate 90°" tags that downstream image
// processors (like the Replicate bg-removal model) ignore — so the cutout
// comes back sideways. Decode through createImageBitmap with from-image,
// downscale, and re-encode as JPEG so the bytes themselves are upright.
async function normalizePhotoForUpload(
  file: File,
  maxDim = 1600
): Promise<Blob> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Canvas not supported in this browser");
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) =>
        b
          ? resolve(b)
          : reject(new Error("Could not encode photo — try JPEG or PNG")),
      "image/jpeg",
      0.92
    );
  });
}

// Mirror a remote image URL into a data URL (returns an effect cleanup). When
// the URL is null the mirror is cleared.
function mirrorToDataUrl(url: string | null, set: (v: string | null) => void) {
  if (!url) {
    set(null);
    return;
  }
  let cancelled = false;
  (async () => {
    try {
      const blob = await (await fetch(url)).blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        if (!cancelled) set(reader.result as string);
      };
      reader.readAsDataURL(blob);
    } catch {
      if (!cancelled) set(url); // fall back to the remote URL
    }
  })();
  return () => {
    cancelled = true;
  };
}

// Ensure an image URL is decoded before we snapshot the card.
async function preloadImage(src: string | null | undefined) {
  if (!src) return;
  try {
    const img = new window.Image();
    img.src = src;
    await img.decode();
  } catch {
    /* ignore — the snapshot will still attempt it */
  }
}

// Standalone export: hand the rendered card sides to the photo library via Web
// Share on mobile, falling back to browser downloads on desktop. Both blobs are
// already sized 2.5"×3.5" at 300 DPI (see card-raster).
async function exportCardImages(front: Blob, back: Blob) {
  const files = [
    new File([front], "card-front.png", { type: "image/png" }),
    new File([back], "card-back.png", { type: "image/png" }),
  ];

  if (navigator.canShare?.({ files })) {
    await navigator.share({ files });
    return;
  }
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    await new Promise((r) => setTimeout(r, 200));
  }
}

// Hand a single rendered image to the device — share sheet on phones (so it
// lands in Messages/Photos), download on desktop.
async function shareFile(blob: Blob, name: string) {
  const file = new File([blob], name, { type: blob.type || "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] });
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function canvasToPngBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("canvas toBlob failed"))),
      "image/png"
    )
  );
}

// One tile of the background contact sheet.
type SheetTile = {
  canvas: HTMLCanvasElement;
  num: number;
  name: string;
  category: string;
  categoryLabel: string;
};

// Lay every rendered front onto a single tall PNG, grouped by category with a
// big number on each so a parent can just text back "4, 23, 34".
async function buildBackgroundSheet(
  tiles: SheetTile[],
  subtitle: string
): Promise<Blob> {
  const COLS = 4;
  const CW = 300;
  const CARD_H = Math.round((CW * 7) / 5);
  const LABEL_H = 30;
  const GAP = 18;
  const MARGIN = 44;
  const TITLE_H = 150;
  const CAT_H = 56;
  const cellH = CARD_H + LABEL_H;
  const sans = "-apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif";

  // Group tiles by category, preserving order.
  const groups: { label: string; items: SheetTile[] }[] = [];
  for (const t of tiles) {
    let g = groups.find((x) => x.label === t.categoryLabel);
    if (!g) {
      g = { label: t.categoryLabel, items: [] };
      groups.push(g);
    }
    g.items.push(t);
  }

  let height = TITLE_H;
  for (const g of groups) {
    const rows = Math.ceil(g.items.length / COLS);
    height += CAT_H + rows * cellH + (rows - 1) * GAP + GAP * 2;
  }
  height += MARGIN;
  const width = MARGIN * 2 + COLS * CW + (COLS - 1) * GAP;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.round(height);
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#0a0a0a";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = `bold 40px ${sans}`;
  ctx.fillText("Pick your card background", MARGIN, 66);
  ctx.fillStyle = "#555555";
  ctx.font = `500 24px ${sans}`;
  ctx.fillText(subtitle, MARGIN, 104);

  let y = TITLE_H;
  for (const g of groups) {
    ctx.fillStyle = "#0a0a0a";
    ctx.font = `bold 26px ${sans}`;
    ctx.fillText(g.label.toUpperCase(), MARGIN, y + 34);
    y += CAT_H;

    g.items.forEach((t, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = MARGIN + col * (CW + GAP);
      const cy = y + row * (cellH + GAP);

      ctx.drawImage(t.canvas, x, cy, CW, CARD_H);
      ctx.strokeStyle = "rgba(0,0,0,0.12)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, cy + 0.5, CW - 1, CARD_H - 1);

      // Number badge, top-left.
      const r = 21;
      const bx = x + 12 + r;
      const by = cy + 12 + r;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(10,10,10,0.85)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold 24px ${sans}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(t.num), bx, by + 1);

      // Name under the card.
      ctx.fillStyle = "#0a0a0a";
      ctx.font = `600 20px ${sans}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(`${t.num}. ${t.name}`, x + 2, cy + CARD_H + 22);
    });

    const rows = Math.ceil(g.items.length / COLS);
    y += rows * cellH + (rows - 1) * GAP + GAP * 2;
  }

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not build the sheet"))),
      "image/png"
    )
  );
}

// Quick ink swatches for restyling a signature (black, white, blue, red, gold);
// a custom color picker sits alongside them.
const SIG_PRESET_COLORS = ["#0a0a0a", "#ffffff", "#1d4ed8", "#dc2626", "#f59e0b"];

// Most copies to render into one serialized .zip. Each card is a full-res PNG,
// so we cap the in-memory bundle (a run of 100 is already a big collectible set).
const SERIAL_CAP = 100;

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
  initialPhotoId,
  standalone = false,
  assignTargets = [],
  allowDrafts = false,
  draftId,
  initialAssignKey,
}: Props) {
  const router = useRouter();

  // Fire once on mount so we know how often the editor is opened.
  useEffect(() => {
    track("card_editor_opened", {
      team: teamName,
      season: season ?? undefined,
      reopened: !!initialDesign?.cutout_url,
    });
    logClientActivity("card_editor_opened", {
      team: teamName,
      season,
      reopened: !!initialDesign?.cutout_url,
    }).catch(() => {});
    // Mount-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [step, setStep] = useState<Step>(
    initialDesign?.cutout_url ? "edit" : "upload"
  );
  const [error, setError] = useState<string | null>(null);
  // Standalone assign-to-player: which player to attach to ("" = export only),
  // and a success note after assigning.
  // Pre-select the earmarked kid on a reopened draft. We don't call selectTarget
  // here — the design is already loaded from initialDesign, so we only want the
  // dropdown selected, not the fields overwritten.
  const [assignTargetKey, setAssignTargetKey] = useState(initialAssignKey ?? "");
  const [notice, setNotice] = useState<string | null>(null);
  // The full-res photo the user just picked/took, kept so they can save it back
  // to their device before we downscale it for background removal. Null when the
  // editor is reopened on a saved design (we never had the original file).
  const [originalPhoto, setOriginalPhoto] = useState<File | null>(null);
  const [savingOriginal, setSavingOriginal] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // "Share all backgrounds" contact sheet: rendering flag + progress counter.
  const [exportingAll, setExportingAll] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

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
  const [rotation, setRotation] = useState(initialDesign?.transform.rotation ?? 0);

  // Signature (front overlay). Position is the element's CENTER as fractions of
  // the stage, so it scales across screen sizes (same idea as the cutout transform).
  const [sigUrl, setSigUrl] = useState<string | null>(initialDesign?.signature?.url ?? null);
  const [sigDataUrl, setSigDataUrl] = useState<string | null>(null);
  const [sigX, setSigX] = useState(initialDesign?.signature?.x ?? 0.5);
  const [sigY, setSigY] = useState(initialDesign?.signature?.y ?? 0.62);
  const [sigScale, setSigScale] = useState(initialDesign?.signature?.scale ?? 1);
  const [sigRotation, setSigRotation] = useState(initialDesign?.signature?.rotation ?? 0);
  const [sigAspect, setSigAspect] = useState(3); // width/height; signatures are wide
  const [showSigPad, setShowSigPad] = useState(false);
  // Retained vector strokes + style, so color/thickness can change without a
  // redraw. Null strokes = a signature drawn before this existed (redraw only).
  const [sigStrokes, setSigStrokes] = useState<SigStroke[] | null>(
    initialDesign?.signature?.strokes ?? null
  );
  const [sigColor, setSigColor] = useState(initialDesign?.signature?.color ?? "#0a0a0a");
  const [sigThickness, setSigThickness] = useState(
    initialDesign?.signature?.thickness ?? DEFAULT_SIG_THICKNESS
  );
  const sigUploadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const [nameFont, setNameFont] = useState(
    initialDesign?.text.name_font ?? NAME_FONTS[0].id
  );
  const [nameSize, setNameSize] = useState(
    initialDesign?.text.name_size ?? 1
  );
  const [nameItalic, setNameItalic] = useState(
    initialDesign?.text.name_italic ?? false
  );
  // Number of copies "in circulation" — a serialized limited-edition stamp on
  // the front. Kept as a string for the input; parsed to a number when saved.
  const [circulation, setCirculation] = useState(
    initialDesign?.circulation != null ? String(initialDesign.circulation) : ""
  );
  // The copy number shown in the stamp. null in normal editing (previews as #1);
  // driven 1..N while rendering the serialized set for export.
  const [serialOverride, setSerialOverride] = useState<number | null>(null);
  const [exportingSerials, setExportingSerials] = useState(false);
  const [serialProgress, setSerialProgress] = useState(0);

  // Raised Foil export — which front elements get the RUVgold spot channel.
  // Empty set = nothing foiled (the export button stays disabled).
  const [foilOn, setFoilOn] = useState<Set<string>>(() => new Set());
  const [foilPending, setFoilPending] = useState(false);
  const toggleFoil = (key: string) =>
    setFoilOn((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

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
  const [seasonQuote, setSeasonQuote] = useState(initBack?.season_quote ?? "");
  const [lookAlike, setLookAlike] = useState(initBack?.look_alike ?? "");
  const [lookAlikePhoto, setLookAlikePhoto] = useState<string | null>(
    initBack?.look_alike_photo ?? null
  );
  const [lookAlikeBlurb, setLookAlikeBlurb] = useState(
    initBack?.look_alike_blurb ?? ""
  );
  // AI "plays like" candidates to choose from (null = picker closed).
  const [lookAlikeOptions, setLookAlikeOptions] = useState<
    LookalikeOption[] | null
  >(null);
  const [headshotUrl, setHeadshotUrl] = useState<string | null>(
    initBack?.headshot_url ?? null
  );
  const [headshotDataUrl, setHeadshotDataUrl] = useState<string | null>(null);
  // Object-position (0–100) so the headshot can be panned within its circle.
  const [headshotPosX, setHeadshotPosX] = useState(initBack?.headshot_x ?? 50);
  const [headshotPosY, setHeadshotPosY] = useState(initBack?.headshot_y ?? 50);
  const [aiPending, setAiPending] = useState<null | "scouting" | "lookalike">(
    null
  );

  const stageRef = useRef<HTMLDivElement>(null);
  const stageWrapRef = useRef<HTMLDivElement>(null);

  // Bring the card preview to the top of the screen (used after a photo loads and
  // when a background is picked, so the change is visible without scrolling up).
  function scrollToPreview() {
    setTimeout(
      () => stageWrapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      80
    );
  }
  const bgLayerRef = useRef<HTMLDivElement>(null);
  const overlayLayerRef = useRef<HTMLDivElement>(null);
  const backStageRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);
  const headshotFileRef = useRef<HTMLInputElement>(null);

  function patchStats(patch: Partial<BackStats>) {
    setStats((s) => ({ ...s, ...patch }));
  }

  // Mirror a remote image into a data URL so html-to-image rasterizes it
  // deterministically (cross-origin <img>/bg can race the rasterizer and snapshot
  // blank). Used for the cutout, the signature, and the headshot.
  useEffect(() => mirrorToDataUrl(cutoutUrl, setCutoutDataUrl), [cutoutUrl]);
  useEffect(() => mirrorToDataUrl(sigUrl, setSigDataUrl), [sigUrl]);
  useEffect(() => mirrorToDataUrl(headshotUrl, setHeadshotDataUrl), [headshotUrl]);

  // Publish the card's rendered width as a CSS variable (--cardw) so all on-card
  // text can be sized as a fraction of the CARD (calc(var(--cardw) * n / 100))
  // rather than the viewport. That keeps the card's proportions identical at any
  // preview size — so the desktop preview can grow without changing the exported
  // 750×1050 card. (getComputedStyle resolves the calc to px, which html-to-image
  // captures reliably; container-query units don't survive its snapshot.) Both the
  // front stage and CardBack sit inside stageWrapRef and inherit the variable.
  useEffect(() => {
    const el = stageWrapRef.current;
    if (!el) return;
    const set = () => el.style.setProperty("--cardw", `${el.clientWidth}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [step]);

  // Measure the signature's natural aspect ratio so the background-image box
  // matches it (no letterboxing).
  useEffect(() => {
    const src = sigDataUrl ?? sigUrl;
    if (!src) return;
    const img = new window.Image();
    img.onload = () => {
      if (img.naturalHeight > 0) setSigAspect(img.naturalWidth / img.naturalHeight);
    };
    img.src = src;
  }, [sigDataUrl, sigUrl]);

  // ── Gestures (front stage) ──────────────────────────────────
  // One finger drags; two fingers pinch-scale + rotate. The layer is chosen by
  // the FIRST finger: on the signature → the signature, otherwise the main
  // photo (so the small signature only needs one finger on it to grab; the
  // second finger can land anywhere).

  const sigImgRef = useRef<HTMLDivElement>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gestureLayer = useRef<"photo" | "sig">("photo");
  const gestureStart = useRef<{
    px: number;
    py: number;
    dist?: number;
    angle?: number;
    tx: number;
    ty: number;
    pScale: number;
    pRot: number;
    sx: number;
    sy: number;
    sScale: number;
    sRot: number;
  } | null>(null);

  function stageSize() {
    const r = stageRef.current?.getBoundingClientRect();
    return { w: r?.width ?? 1, h: r?.height ?? 1 };
  }

  function overSignature(x: number, y: number): boolean {
    if (!(sigDataUrl ?? sigUrl) || !sigImgRef.current) return false;
    const r = sigImgRef.current.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  function gestureSnapshot(pts: { x: number; y: number }[]) {
    const base = {
      tx,
      ty,
      pScale: scale,
      pRot: rotation,
      sx: sigX,
      sy: sigY,
      sScale: sigScale,
      sRot: sigRotation,
    };
    if (pts.length >= 2) {
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      return {
        ...base,
        px: (pts[0].x + pts[1].x) / 2,
        py: (pts[0].y + pts[1].y) / 2,
        dist: Math.hypot(dx, dy),
        angle: Math.atan2(dy, dx),
      };
    }
    return { ...base, px: pts[0].x, py: pts[0].y };
  }

  function onStagePointerDown(e: React.PointerEvent) {
    stageRef.current?.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 1) {
      gestureLayer.current = overSignature(e.clientX, e.clientY) ? "sig" : "photo";
    }
    gestureStart.current = gestureSnapshot(pts);
  }

  function onStagePointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gestureStart.current;
    if (!g) return;
    const pts = [...pointers.current.values()];
    const { w, h } = stageSize();
    const sig = gestureLayer.current === "sig";
    if (pts.length === 1) {
      const dx = (pts[0].x - g.px) / w;
      const dy = (pts[0].y - g.py) / h;
      if (sig) {
        setSigX(Math.max(0, Math.min(1, g.sx + dx)));
        setSigY(Math.max(0, Math.min(1, g.sy + dy)));
      } else {
        setTx(g.tx + dx);
        setTy(g.ty + dy);
      }
    } else if (pts.length >= 2 && g.dist) {
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const ratio = Math.hypot(dx, dy) / g.dist;
      const dDeg = ((Math.atan2(dy, dx) - (g.angle ?? 0)) * 180) / Math.PI;
      if (sig) {
        setSigScale(Math.max(0.2, Math.min(5, g.sScale * ratio)));
        setSigRotation(g.sRot + dDeg);
      } else {
        setScale(Math.max(0.2, Math.min(3, g.pScale * ratio)));
        setRotation(g.pRot + dDeg);
      }
    }
  }

  function onStagePointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    const pts = [...pointers.current.values()];
    // Re-baseline so a remaining finger keeps dragging from the current spot.
    gestureStart.current = pts.length === 0 ? null : gestureSnapshot(pts);
  }

  // ── Signature pad result + headshot upload ─────────────────

  // Upload a rendered signature PNG and point sigUrl at it (for persistence).
  async function uploadSignature(dataUrl: string) {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const blob = await (await fetch(dataUrl)).blob();
      const path = `${user.id}/cardgen-sig/${crypto.randomUUID()}.png`;
      const { error: upErr } = await supabase.storage
        .from("player-photos")
        .upload(path, blob, { upsert: false, contentType: "image/png" });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("player-photos").getPublicUrl(path);
      setSigUrl(urlData.publicUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleSignatureDrawn(sig: SignatureResult) {
    setShowSigPad(false);
    setSigStrokes(sig.strokes);
    setSigColor(sig.color);
    setSigThickness(sig.thickness);
    setSigDataUrl(sig.dataUrl); // instant render
    track("card_signature_added");
    logClientActivity("card_signature_added").catch(() => {});
    await uploadSignature(sig.dataUrl);
  }

  // Recolor / re-thicken the existing signature from its retained strokes — no
  // redraw. Preview updates instantly; the re-upload (for persistence) is
  // debounced so dragging a slider doesn't spam storage.
  function restyleSignature(color: string, thickness: number) {
    if (!sigStrokes) return;
    setSigColor(color);
    setSigThickness(thickness);
    const dataUrl = renderSignaturePng(sigStrokes, color, thickness);
    setSigDataUrl(dataUrl);
    if (sigUploadTimer.current) clearTimeout(sigUploadTimer.current);
    sigUploadTimer.current = setTimeout(() => {
      uploadSignature(dataUrl).catch(() => {});
    }, 500);
  }

  async function handleHeadshotSelected(file: File) {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      // Instant render from the file while it uploads.
      const reader = new FileReader();
      reader.onloadend = () => setHeadshotDataUrl(reader.result as string);
      reader.readAsDataURL(file);
      const path = `${user.id}/cardgen-headshot/${crypto.randomUUID()}.${fileExt(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from("player-photos")
        .upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("player-photos").getPublicUrl(path);
      setHeadshotUrl(urlData.publicUrl);
      track("card_headshot_added");
      logClientActivity("card_headshot_added").catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Drag the headshot to pan it within its circle (object-position).
  const headshotDrag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  function onHeadshotPointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    headshotDrag.current = { x: headshotPosX, y: headshotPosY, px: e.clientX, py: e.clientY };
  }
  function onHeadshotPointerMove(e: React.PointerEvent) {
    if (!headshotDrag.current) return;
    e.stopPropagation();
    const box = (backStageRef.current?.getBoundingClientRect().width ?? 300) * 0.22;
    const dx = e.clientX - headshotDrag.current.px;
    const dy = e.clientY - headshotDrag.current.py;
    const clamp = (v: number) => Math.max(0, Math.min(100, v));
    setHeadshotPosX(clamp(headshotDrag.current.x - (dx / box) * 100));
    setHeadshotPosY(clamp(headshotDrag.current.y - (dy / box) * 100));
  }
  function onHeadshotPointerUp() {
    headshotDrag.current = null;
  }

  // ── Photo upload + bg-removal ──────────────────────────────

  async function handlePhotoSelected(file: File) {
    setStep("processing");
    setError(null);
    // Hold onto the untouched original so it can be saved to the device below;
    // everything downstream works off a downscaled copy.
    setOriginalPhoto(file);
    const startedAt = Date.now();
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const normalized = await normalizePhotoForUpload(file);
      const path = `${user.id}/cardgen-src/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("player-photos")
        .upload(path, normalized, {
          upsert: false,
          contentType: "image/jpeg",
        });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage
        .from("player-photos")
        .getPublicUrl(path);

      track("card_photo_uploaded", { bytes: normalized.size });
      logClientActivity("card_photo_uploaded", { bytes: normalized.size }).catch(() => {});

      const result = await removeBackground(urlData.publicUrl);
      const ms = Date.now() - startedAt;
      if (result.error) {
        track("card_bg_removal_failed", { error: result.error });
        logClientActivity("card_bg_removal_failed", { error: result.error }).catch(() => {});
        throw new Error(result.error);
      }

      track("card_bg_removed", { ms });
      logClientActivity("card_bg_removed", { ms }).catch(() => {});

      setCutoutUrl(result.cutoutUrl!);
      setTx(0);
      setTy(0);
      setScale(1);
      setRotation(0);
      setStep("edit");
      // Bring the preview to the top of the screen so the controls below are
      // reachable without dragging the photo while trying to scroll past it.
      scrollToPreview();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("upload");
    }
  }

  // Hand the untouched original back to the device. On phones this opens the
  // share sheet ("Save Image" → Photos / "Save to Files"); on desktop it falls
  // back to a download. iOS can't write to Photos silently, so this is the one
  // reliable way to keep the full-res shot.
  async function saveOriginalToDevice() {
    if (!originalPhoto || savingOriginal) return;
    setSavingOriginal(true);
    try {
      const file = originalPhoto;
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const url = URL.createObjectURL(file);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name || `${(firstName || "photo").toLowerCase()}-original.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      track("card_original_saved");
      logClientActivity("card_original_saved").catch(() => {});
    } catch {
      // User dismissed the share sheet — nothing to do.
    } finally {
      setSavingOriginal(false);
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
      scrollToPreview();
      track("card_bg_image_uploaded");
      logClientActivity("card_bg_image_uploaded").catch(() => {});
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
      if (res.report) {
        setScoutingReport(res.report);
        track("card_scouting_generated");
        logClientActivity("card_scouting_generated").catch(() => {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiPending(null);
    }
  }

  // Ask the AI for ~10 "plays like" candidates and open a picker; the coach
  // chooses one (below) instead of us auto-filling a single guess.
  async function handleFindLookalike() {
    if (!cutoutUrl) return;
    setAiPending("lookalike");
    setError(null);
    try {
      const res = await findLookalike(cutoutUrl, {
        firstName,
        position: stats.position,
        height: stats.height,
        favoritePlayer: stats.favorite_player,
        scoutingReport,
      });
      if (res.error) throw new Error(res.error);
      if (res.options && res.options.length) {
        setLookAlikeOptions(res.options);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiPending(null);
    }
  }

  // Apply the chosen match to the card and close the picker.
  function applyLookalike(opt: LookalikeOption) {
    setLookAlike(opt.name);
    setLookAlikePhoto(opt.photoUrl ?? null);
    setLookAlikeBlurb(opt.blurb ?? "");
    setLookAlikeOptions(null);
    track("card_lookalike_generated", { name: opt.name });
    logClientActivity("card_lookalike_generated", { name: opt.name }).catch(() => {});
  }

  // ── Save ────────────────────────────────────────────────────

  // Composite both card sides to true 2.5"×3.5" PNG blobs (canvas drawImage for
  // raster layers — reliable on iOS, unlike the foreignObject snapshot).
  async function renderSides(): Promise<{ frontBlob: Blob; backBlob: Blob }> {
    const frontBlob = await compositeFront({
      bgEl: bgLayerRef.current!,
      overlayEl: overlayLayerRef.current!,
      cutoutSrc: cutoutDataUrl,
      cutout: { tx, ty, scale, rotation },
      sigSrc: sigDataUrl ?? sigUrl,
      sig: { x: sigX, y: sigY, rotation: sigRotation, widthFrac: 0.38 * sigScale },
    });
    const backBlob = backStageRef.current
      ? await compositeBack({
          backEl: backStageRef.current,
          headshotSrc: headshotDataUrl ?? headshotUrl,
          headshot: { posX: headshotPosX, posY: headshotPosY },
          lookalikeSrc: lookAlikePhoto,
        })
      : frontBlob;
    return { frontBlob, backBlob };
  }

  // The full design payload, shared by the save-to-player and draft paths.
  function buildDesign(): CardDesign {
    return {
      cutout_url: cutoutUrl ?? "",
      background: bg,
      transform: { x: tx, y: ty, scale, rotation },
      text: {
        team_name: teamText,
        age_group: ageText || null,
        season: seasonText || null,
        name_line1: nameL1,
        name_line2: nameL2,
        color_scheme: colorScheme,
        name_font: nameFont,
        name_size: nameSize,
        name_italic: nameItalic,
      },
      circulation:
        circulation.trim() && Number.isFinite(Number(circulation))
          ? Number(circulation)
          : null,
      back: {
        stats,
        scouting_report: scoutingReport,
        season_quote: seasonQuote,
        look_alike: lookAlike,
        look_alike_photo: lookAlikePhoto,
        look_alike_blurb: lookAlikeBlurb || undefined,
        headshot_url: headshotUrl,
        headshot_x: headshotPosX,
        headshot_y: headshotPosY,
      },
      signature: sigUrl
        ? {
            url: sigUrl,
            x: sigX,
            y: sigY,
            scale: sigScale,
            rotation: sigRotation,
            ...(sigStrokes
              ? { strokes: sigStrokes, color: sigColor, thickness: sigThickness }
              : {}),
          }
        : null,
    };
  }

  // Download the rendered front & back straight to the device without saving a
  // draft or attaching to a player — share sheet on phones, downloads on desktop.
  async function handleDownloadCard() {
    if (!stageRef.current || !cutoutUrl || downloading) return;
    setDownloading(true);
    setError(null);
    setNotice(null);
    try {
      if ("fonts" in document) await (document as Document).fonts.ready;
      await Promise.all([
        preloadImage(cutoutDataUrl),
        preloadImage(sigDataUrl ?? sigUrl),
        preloadImage(headshotDataUrl ?? headshotUrl),
      ]);
      const { frontBlob, backBlob } = await renderSides();
      await exportCardImages(frontBlob, backBlob);
      const template = bg.type === "template" ? bg.id : "custom";
      track("card_downloaded", { standalone, template });
      logClientActivity("card_downloaded", { standalone, template }).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(false);
    }
  }

  // Export a print-ready Raised Foil PDF: the card art in CMYK plus a RUVgold
  // spot channel masking the toggled front elements. The server assembles it
  // (sharp + pdf-lib); here we just render the base art and the foil mask in
  // register, add bleed, and POST them. Separate from the normal PNG download.
  async function handleFoilPdf() {
    if (!stageRef.current || !cutoutUrl || foilPending || foilOn.size === 0)
      return;
    setFoilPending(true);
    setError(null);
    setNotice(null);
    try {
      if ("fonts" in document) await (document as Document).fonts.ready;
      await Promise.all([
        preloadImage(cutoutDataUrl),
        preloadImage(sigDataUrl ?? sigUrl),
      ]);
      const sig = {
        x: sigX,
        y: sigY,
        rotation: sigRotation,
        widthFrac: 0.38 * sigScale,
      };
      // Trim-size (2.5×3.5) base art + foil mask, rendered from the same layers
      // so they line up pixel-for-pixel.
      const baseCanvas = await compositeFrontCanvas({
        bgEl: bgLayerRef.current!,
        overlayEl: overlayLayerRef.current!,
        cutoutSrc: cutoutDataUrl,
        cutout: { tx, ty, scale, rotation },
        sigSrc: sigDataUrl ?? sigUrl,
        sig,
      });
      const maskCanvas = await compositeFoilMaskCanvas({
        overlayEl: overlayLayerRef.current!,
        selected: foilOn,
        sigSrc: sigDataUrl ?? sigUrl,
        sig,
      });
      // Add 0.05" bleed on each edge → 2.6×3.6" (780×1080 @ 300 DPI).
      const base = coverIntoCanvas(baseCanvas, 780, 1080, "#fff");
      const mask = coverIntoCanvas(maskCanvas, 780, 1080, "#000");
      const [baseBlob, maskBlob] = await Promise.all([
        canvasToPngBlob(base),
        canvasToPngBlob(mask),
      ]);
      const nameBase =
        (firstName || nameL1 || "card").toLowerCase().replace(/\s+/g, "-") ||
        "card";
      const form = new FormData();
      form.append("base", baseBlob, "base.png");
      form.append("mask", maskBlob, "mask.png");
      form.append("widthIn", "2.6");
      form.append("heightIn", "3.6");
      form.append("spot", "RUVgold");
      form.append("filename", nameBase);
      const res = await fetch("/tools/card-creator/foil-pdf", {
        method: "POST",
        body: form,
      });
      if (!res.ok)
        throw new Error((await res.text()) || `Export failed (${res.status})`);
      await shareFile(await res.blob(), `${nameBase}-RUVgold.pdf`);
      const elements = [...foilOn].sort().join(",");
      track("card_foil_exported", { elements });
      logClientActivity("card_foil_exported", { elements }).catch(() => {});
      setNotice("Raised Foil PDF exported (RUVgold spot channel).");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFoilPending(false);
    }
  }

  // Render the front on EVERY background template and tile them into one
  // numbered PNG to share with parents ("text me the numbers you like"). Each
  // tile is the real card front — nothing cut off like the picker thumbnails.
  // We reuse the live front layers by switching the background one at a time
  // (flushSync so the DOM is committed before we snapshot); a covering overlay
  // hides the flicker while it runs.
  async function exportAllBackgrounds() {
    if (!stageRef.current || !cutoutUrl || exportingAll) return;
    const originalBg = bg;
    setExportingAll(true);
    setExportProgress(0);
    setError(null);
    setNotice(null);
    try {
      if ("fonts" in document) await (document as Document).fonts.ready;
      await Promise.all([
        preloadImage(cutoutDataUrl),
        preloadImage(sigDataUrl ?? sigUrl),
      ]);

      const labelFor = (cat: string) =>
        TEMPLATE_CATEGORIES.find((c) => c.key === cat)?.label ?? cat;

      const tiles: SheetTile[] = [];
      for (let i = 0; i < TEMPLATES.length; i++) {
        const t = TEMPLATES[i];
        flushSync(() => setBg({ type: "template", id: t.id }));
        // Wait for the browser to commit the new background before snapshotting.
        await new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r))
        );
        const canvas = await compositeFrontCanvas(
          {
            bgEl: bgLayerRef.current!,
            overlayEl: overlayLayerRef.current!,
            cutoutSrc: cutoutDataUrl,
            cutout: { tx, ty, scale, rotation },
            sigSrc: sigDataUrl ?? sigUrl,
            sig: { x: sigX, y: sigY, rotation: sigRotation, widthFrac: 0.38 * sigScale },
          },
          300
        );
        tiles.push({
          canvas,
          num: i + 1,
          name: t.name,
          category: t.category,
          categoryLabel: labelFor(t.category),
        });
        setExportProgress(i + 1);
      }

      const who = [nameL1, nameL2].filter(Boolean).join(" ").trim();
      const subtitle = who
        ? `${who} — text me the number(s) you like, e.g. "4, 23, 34".`
        : `Text me the number(s) you like, e.g. "4, 23, 34".`;
      const sheet = await buildBackgroundSheet(tiles, subtitle);
      await shareFile(
        sheet,
        `${(who || "card").toLowerCase().replace(/\s+/g, "-")}-background-options.png`
      );
      track("card_bg_options_exported", { count: TEMPLATES.length });
      logClientActivity("card_bg_options_exported", {
        count: TEMPLATES.length,
      }).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      // Restore the background the user had selected.
      flushSync(() => setBg(originalBg));
      setExportingAll(false);
      setExportProgress(0);
    }
  }

  // Render the serialized run: the same card N times, each stamped a different
  // copy number (1/N … N/N), bundled into one .zip of print-ready PNGs plus a
  // single shared back. Same live-layer + flushSync approach as the background
  // sheet; a covering overlay hides the per-copy flicker.
  async function exportSerializedSet() {
    const total = Math.floor(Number(circulation));
    if (
      !stageRef.current ||
      !cutoutUrl ||
      exportingSerials ||
      !circulation.trim() ||
      !Number.isFinite(total) ||
      total < 1
    )
      return;
    const count = Math.min(total, SERIAL_CAP);
    const savedSerial = serialOverride;
    setExportingSerials(true);
    setSerialProgress(0);
    setError(null);
    setNotice(null);
    try {
      if ("fonts" in document) await (document as Document).fonts.ready;
      await Promise.all([
        preloadImage(cutoutDataUrl),
        preloadImage(sigDataUrl ?? sigUrl),
        preloadImage(headshotDataUrl ?? headshotUrl),
      ]);

      const width = String(count).length;
      const entries: ZipEntry[] = [];
      for (let i = 1; i <= count; i++) {
        flushSync(() => setSerialOverride(i));
        await new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r))
        );
        const frontBlob = await compositeFront({
          bgEl: bgLayerRef.current!,
          overlayEl: overlayLayerRef.current!,
          cutoutSrc: cutoutDataUrl,
          cutout: { tx, ty, scale, rotation },
          sigSrc: sigDataUrl ?? sigUrl,
          sig: { x: sigX, y: sigY, rotation: sigRotation, widthFrac: 0.38 * sigScale },
        });
        entries.push({
          name: `front-${String(i).padStart(width, "0")}-of-${total}.png`,
          data: new Uint8Array(await frontBlob.arrayBuffer()),
        });
        setSerialProgress(i);
      }

      // The back is identical across copies — include it once.
      if (backStageRef.current) {
        const backBlob = await compositeBack({
          backEl: backStageRef.current,
          headshotSrc: headshotDataUrl ?? headshotUrl,
          headshot: { posX: headshotPosX, posY: headshotPosY },
          lookalikeSrc: lookAlikePhoto,
        });
        entries.push({
          name: "back-(same-for-all).png",
          data: new Uint8Array(await backBlob.arrayBuffer()),
        });
      }

      const who = [nameL1, nameL2].filter(Boolean).join(" ").trim();
      const zip = buildZip(entries);
      await shareFile(
        zip,
        `${(who || "card").toLowerCase().replace(/\s+/g, "-")}-serialized-1-to-${count}.zip`
      );
      if (count < total) {
        setNotice(
          `Made the first ${count} of ${total}. Serialized sets are capped at ${SERIAL_CAP} per download.`
        );
      }
      track("card_serials_exported", { count });
      logClientActivity("card_serials_exported", { count }).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      flushSync(() => setSerialOverride(savedSerial));
      setExportingSerials(false);
      setSerialProgress(0);
    }
  }

  // Save the card as a draft (owner only) — player/team typed in, but not
  // attached to a real player. Rendered sides are stored for the drafts list.
  async function handleSaveDraft() {
    if (!stageRef.current || !cutoutUrl) return;
    setStep("saving");
    setError(null);
    setNotice(null);
    try {
      if ("fonts" in document) await (document as Document).fonts.ready;
      await Promise.all([
        preloadImage(cutoutDataUrl),
        preloadImage(sigDataUrl ?? sigUrl),
        preloadImage(headshotDataUrl ?? headshotUrl),
      ]);
      const { frontBlob, backBlob } = await renderSides();

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const id = crypto.randomUUID();
      const up = async (path: string, blob: Blob) => {
        const { error } = await supabase.storage
          .from("player-photos")
          .upload(path, blob, { contentType: "image/png", upsert: false });
        if (error) throw error;
        return supabase.storage.from("player-photos").getPublicUrl(path).data.publicUrl;
      };
      const frontUrl = await up(`${user.id}/card-drafts/${id}.png`, frontBlob);
      const backUrl = await up(`${user.id}/card-drafts/${id}-back.png`, backBlob);

      // Earmark the draft for the kid picked in "Whose card is this?" (if any).
      // This only tags the draft — no player_photos row, so it stays off the
      // kid's profile until it's published.
      const draftTarget = assignTargetKey
        ? assignTargets.find((t) => t.key === assignTargetKey)
        : undefined;
      const res = await saveCardDraft({
        id: draftId,
        label: [nameL1, nameL2].filter(Boolean).join(" "),
        teamName: teamText,
        season: seasonText,
        frontUrl,
        backUrl,
        cardDesign: buildDesign(),
        playerId: draftTarget?.id,
        teamId: draftTarget?.teamId ?? undefined,
      });
      if (res.error) throw new Error(res.error);

      track("card_draft_saved");
      logClientActivity("card_draft_saved").catch(() => {});
      setNotice("Draft saved.");
      setStep("edit");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("edit");
    }
  }

  async function handleSave(targetKey?: string) {
    if (!stageRef.current || !cutoutUrl) return;
    setStep("saving");
    setError(null);
    setNotice(null);
    try {
      // Decode the layer images before snapshotting so the rasterizer can't
      // race and emit a card missing the photo/signature/headshot.
      if ("fonts" in document) await (document as Document).fonts.ready;
      await Promise.all([
        preloadImage(cutoutDataUrl),
        preloadImage(sigDataUrl ?? sigUrl),
        preloadImage(headshotDataUrl ?? headshotUrl),
      ]);

      // ── Rasterize both sides at 2.5"×3.5" (750×1050 @ 300 DPI) ──
      const { frontBlob, backBlob } = await renderSides();

      // ── Standalone with no chosen player — save both sides to Photos ──
      if (standalone && !targetKey) {
        await exportCardImages(frontBlob, backBlob);
        track("card_downloaded", {
          standalone: true,
          template: bg.type === "template" ? bg.id : "custom",
        });
        logClientActivity("card_downloaded", {
          standalone: true,
          template: bg.type === "template" ? bg.id : "custom",
        }).catch(() => {});
        setStep("edit");
        return;
      }

      // Otherwise attach to a player: the prop player (player card page) or the
      // chosen assign target (standalone Card Creator). A target carries the
      // specific team picked, so a multi-team kid saves under the right team.
      const target = targetKey ? assignTargets.find((t) => t.key === targetKey) : undefined;
      const targetPlayerId = target?.id ?? playerId;
      if (!targetPlayerId) throw new Error("No player to attach this card to.");

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const frontId = crypto.randomUUID();
      const frontPath = `${user.id}/cards/${frontId}.png`;
      const { error: frontUpErr } = await supabase.storage
        .from("player-photos")
        .upload(frontPath, frontBlob, { contentType: "image/png", upsert: false });
      if (frontUpErr) throw frontUpErr;
      const { data: frontUrlData } = supabase.storage
        .from("player-photos")
        .getPublicUrl(frontPath);

      // ── Upload back (always saved, so every card has both sides) ──
      const backStoragePath = `${user.id}/cards/${frontId}-back.png`;
      const { error: backUpErr } = await supabase.storage
        .from("player-photos")
        .upload(backStoragePath, backBlob, { contentType: "image/png", upsert: false });
      if (backUpErr) throw backUpErr;
      const backPublicUrl = supabase.storage
        .from("player-photos")
        .getPublicUrl(backStoragePath).data.publicUrl;

      const res = await savePlayerPhoto({
        playerId: targetPlayerId,
        // Only edit in place when saving back to the same card the editor opened
        // (no assign target picked). Assigning to a chosen player always inserts.
        photoId: !targetKey ? initialPhotoId ?? undefined : undefined,
        storagePath: frontPath,
        publicUrl: frontUrlData.publicUrl,
        backStoragePath,
        backPublicUrl,
        teamName: teamText,
        season: seasonText || season || undefined,
        teamId: (target ? target.teamId : teamId) ?? undefined,
        cardDesign: buildDesign(),
      });
      if (res.error) throw new Error(res.error);

      // A draft that's now a real card → remove it from the drafts list.
      if (draftId) await deleteCardDraft(draftId).catch(() => {});

      track("card_saved", {
        team: teamText,
        season: seasonText || season || undefined,
        template: bg.type === "template" ? bg.id : "custom",
        assigned: !!targetKey,
      });
      logClientActivity("card_saved", {
        team: teamText,
        season: seasonText || season || null,
        template: bg.type === "template" ? bg.id : "custom",
        assigned: !!targetKey,
      }).catch(() => {});

      // Standalone assign: stay in the tool with a confirmation (they may make
      // another). Player-card page: navigate back as before.
      if (standalone) {
        setNotice(`Saved to ${target?.name ?? "player"}.`);
        setStep("edit");
        router.refresh();
      } else {
        setStep("saved");
        router.push(returnHref);
        router.refresh();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      track("card_save_failed", { error: msg });
      logClientActivity("card_save_failed", { error: msg }).catch(() => {});
      setError(msg);
      setStep("edit");
    }
  }

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

  // Picking a player auto-fills the card from their details; choosing "no
  // player" leaves whatever the user already typed alone.
  function selectTarget(key: string) {
    setAssignTargetKey(key);
    setNotice(null);
    const t = assignTargets.find((x) => x.key === key);
    if (!t) return;
    setNameL1((t.firstName || "").toUpperCase());
    setNameL2((t.lastName || "").toUpperCase());
    setTeamText((t.teamName || "").toUpperCase());
    setAgeText(t.ageGroup || "");
    setSeasonText(t.season || "");
    setStats((s) => ({ ...s, jersey: t.jersey || "", age: t.playerAge || "" }));
  }

  // Player picker — shown just below the preview in standalone mode when there
  // are targets; choosing a player auto-fills the card.
  const playerPicker =
    standalone && assignTargets.length > 0 ? (
      <label className="block mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Whose card is this?
        </span>
        <select
          value={assignTargetKey}
          onChange={(e) => selectTarget(e.target.value)}
          className="mt-1.5 w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
        >
          <option value="">— No player (save to photos) —</option>
          {assignTargets.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
              {t.teamName ? ` · ${t.teamName}` : ""}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">
          Fills in the name, team, and stats automatically — you can still edit anything.
        </p>
      </label>
    ) : null;

  // ── Render ──────────────────────────────────────────────────

  if (step === "upload") {
    return (
      <div className="max-w-md mx-auto overflow-x-hidden">
        {error && (
          <p className="text-sm text-red-500 dark:text-red-400 mb-3">{error}</p>
        )}
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl px-6 py-16 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
        >
          <div className="text-5xl mb-3">📸</div>
          <p className="text-base font-semibold text-gray-700 dark:text-gray-200">
            {firstName ? `Pick a photo of ${firstName}` : "Pick a photo"}
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
    <div className="w-full max-w-md lg:max-w-none mx-auto overflow-x-hidden lg:overflow-x-visible">
      {error && (
        <p className="text-sm text-red-500 dark:text-red-400 mb-3">{error}</p>
      )}

      {/* On wide screens the preview pins to the left and the controls scroll on
          the right; it stacks back to a single column on phones. The preview
          column grows with the viewport (clamp) up to a cap; the controls cap so
          sliders don't stretch; the pair centers once both maxed out. */}
      <div className="lg:grid lg:justify-center lg:gap-8 lg:items-start lg:[grid-template-columns:clamp(22rem,30vw,30rem)_minmax(0,46rem)]">
        {/* Preview column — sticky on desktop so it stays in view while editing. */}
        <div className="lg:sticky lg:top-16 lg:self-start">
      {/* Side toggle */}
      <div className="flex gap-1 mb-3 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
        {(["front", "back"] as const).map((s) => (
          <button
            key={s}
            onClick={() => {
              if (s !== side) {
                setSide(s);
                track("card_side_switched", { side: s });
                logClientActivity("card_side_switched", { side: s }).catch(() => {});
              }
            }}
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

      {/* Stage container — both sides rendered; inactive is offscreen but
          rasterizable. overflow-hidden contains the offscreen stage so the page
          can't scroll sideways. scroll-mt offsets the sticky header on auto-scroll. */}
      <div ref={stageWrapRef} className="relative w-full overflow-hidden scroll-mt-20">
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
            seasonQuote={seasonQuote}
            lookAlike={lookAlike}
            lookAlikePhoto={lookAlikePhoto}
            lookAlikeBlurb={lookAlikeBlurb}
            headshotUrl={headshotDataUrl ?? headshotUrl}
            headshotPosition={`${headshotPosX}% ${headshotPosY}%`}
            onHeadshotPointerDown={onHeadshotPointerDown}
            onHeadshotPointerMove={onHeadshotPointerMove}
            onHeadshotPointerUp={onHeadshotPointerUp}
          />
        </div>

        {/* Front stage — wrapped so the captured node (stageRef) is never the
            offscreen-positioned one (toPng of a left:-99999 node renders black). */}
        <div
          style={
            side === "front"
              ? undefined
              : { position: "absolute", left: -99999, top: 0, width: "100%" }
          }
        >
        <div
          ref={stageRef}
          onPointerDown={onStagePointerDown}
          onPointerMove={onStagePointerMove}
          onPointerUp={onStagePointerUp}
          onPointerCancel={onStagePointerUp}
          className="relative w-full mx-auto rounded-2xl overflow-hidden select-none touch-none shadow-lg"
          style={{ aspectRatio: "5 / 7", cursor: "grab" }}
        >
        {/* Background layer — captured on its own so the cutout can be drawn
            between it and the text overlays when compositing. */}
        <div
          ref={bgLayerRef}
          style={{ position: "absolute", inset: 0, ...bgStyle, pointerEvents: "none" }}
        />

        {/* Cutout — drawn straight onto the canvas at export (iOS drops raster
            images from the foreignObject snapshot); the stage handles gestures. */}
        {cutoutDataUrl && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              backgroundImage: `url(${cutoutDataUrl})`,
              backgroundSize: "contain",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              transform: `translate(${tx * 100}%, ${ty * 100}%) rotate(${rotation}deg) scale(${scale})`,
              transformOrigin: "center center",
              pointerEvents: "none",
            }}
          />
        )}

        {/* Overlay layer — jersey/plate/name; captured as one transparent layer
            and composited on top of the photo. */}
        <div ref={overlayLayerRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {/* Jersey number badge — top right. */}
        {stats.jersey && (
          <div
            data-foil="jersey"
            style={{
              position: "absolute",
              top: "6%",
              right: "7%",
              minWidth: "14%",
              aspectRatio: "1 / 1",
              borderRadius: "9999px",
              background: "rgba(10,10,10,0.85)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-anton), Impact, sans-serif",
              fontSize: "calc(var(--cardw, 22rem) * 7 / 100)",
              letterSpacing: "0.02em",
              // drop-shadow (not box-shadow): box-shadow on a round element
              // rasterizes to a rectangular shadow through html-to-image.
              filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.4))",
              pointerEvents: "none",
            }}
          >
            #{stats.jersey}
          </div>
        )}

        {/* Team name plate — stacked chevron-cut chips. Plate stays flush to the
            left edge (full-bleed), but the text is inset so print trim can't
            clip it. */}
        <div
          data-foil="team"
          style={{
            position: "absolute",
            top: "6.5%",
            left: 0,
            pointerEvents: "none",
            filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.45))",
          }}
        >
          <div
            style={{
              background: "#fff",
              color: "#0a0a0a",
              padding: "0.38em 1.6em 0.38em 8%",
              clipPath:
                "polygon(0 0, 100% 0, calc(100% - 0.8em) 100%, 0 100%)",
              fontFamily: "var(--font-anton), Impact, sans-serif",
              fontSize: "calc(var(--cardw, 22rem) * 7 / 100)",
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
                padding: "0.45em 1.6em 0.45em 8%",
                clipPath:
                  "polygon(0 0, 100% 0, calc(100% - 0.7em) 100%, 0 100%)",
                fontFamily:
                  "var(--font-geist-sans), system-ui, sans-serif",
                fontSize: "calc(var(--cardw, 22rem) * 2.7 / 100)",
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
          data-foil="name"
          style={{
            position: "absolute",
            left: "8%",
            right: "8%",
            bottom: "7%",
            pointerEvents: "none",
            fontFamily: getNameFont(nameFont).family,
            fontStyle: nameItalic ? "italic" : "normal",
            color: titleColor,
            textShadow: titleShadow,
            lineHeight: 0.92,
            letterSpacing: "0.01em",
          }}
        >
          <div style={{ fontSize: `calc(var(--cardw, 22rem) * ${11 * nameSize} / 100)` }}>{nameL1}</div>
          <div style={{ fontSize: `calc(var(--cardw, 22rem) * ${11 * nameSize} / 100)`, marginTop: "2%" }}>
            {nameL2}
          </div>
        </div>

        {/* Circulation / limited-edition stamp — the classic serialized spot,
            tucked top-right under the jersey number (or at the top when there's
            no jersey). Part of the overlay layer, so it exports automatically. */}
        {circulation.trim() && (
          <div
            data-foil="stamp"
            style={{
              position: "absolute",
              top: stats.jersey ? "18.5%" : "6.5%",
              right: "7%",
              textAlign: "right",
              pointerEvents: "none",
              color: isLight ? "#fde047" : "#92400e",
              filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.55))",
              lineHeight: 1.05,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
                fontSize: "calc(var(--cardw, 22rem) * 1.7 / 100)",
                letterSpacing: "0.18em",
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              LIMITED EDITION
            </div>
            <div
              style={{
                fontFamily: "var(--font-anton), Impact, sans-serif",
                fontSize: "calc(var(--cardw, 22rem) * 4 / 100)",
                letterSpacing: "0.02em",
                whiteSpace: "nowrap",
              }}
            >
              {serialOverride ?? 1} / {circulation}
            </div>
          </div>
        )}
        </div>

        {/* Signature overlay — gestures handled at the stage level (pointerEvents
            none); placed/scaled/rotated via stored fractions. */}
        {(sigDataUrl ?? sigUrl) && (
          <div
            ref={sigImgRef}
            style={{
              position: "absolute",
              left: `${sigX * 100}%`,
              top: `${sigY * 100}%`,
              width: `${38 * sigScale}%`,
              aspectRatio: `${sigAspect}`,
              transform: `translate(-50%, -50%) rotate(${sigRotation}deg)`,
              backgroundImage: `url(${sigDataUrl ?? sigUrl})`,
              backgroundSize: "contain",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              pointerEvents: "none",
              zIndex: 5,
            }}
          />
        )}
        </div>
        </div>
      </div>
        </div>
        {/* end preview column */}

        {/* Controls column */}
        <div className="min-w-0">
      {/* Player picker — first thing below the preview (auto-fills the card). */}
      {playerPicker}

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
              <div>
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
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400">
                  Rotation: {Math.round(rotation)}°
                </label>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={rotation}
                  onChange={(e) => setRotation(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setTx(0);
                    setTy(0);
                    setScale(1);
                    setRotation(0);
                  }}
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Reset
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
                Drag the player to move. Pinch to scale on phones. Use sliders for rotation.
              </p>
              {originalPhoto && (
                <button
                  onClick={saveOriginalToDevice}
                  disabled={savingOriginal}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                >
                  {savingOriginal ? "Saving…" : "⬇︎ Save original photo to your device"}
                </button>
              )}

              {/* Signature */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Signature</span>
                  <div className="flex gap-2">
                    {(sigDataUrl ?? sigUrl) && (
                      <button
                        onClick={() => {
                          setSigUrl(null);
                          setSigDataUrl(null);
                          setSigStrokes(null);
                        }}
                        className="text-xs font-medium text-gray-400 hover:text-red-600"
                      >
                        Remove
                      </button>
                    )}
                    <button
                      onClick={() => setShowSigPad(true)}
                      className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {(sigDataUrl ?? sigUrl) ? "Redraw" : "✍️ Draw signature"}
                    </button>
                  </div>
                </div>
                {(sigDataUrl ?? sigUrl) && (
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400">
                      Signature size: {Math.round(sigScale * 100)}%
                    </label>
                    <input
                      type="range"
                      min={0.4}
                      max={2}
                      step={0.05}
                      value={sigScale}
                      onChange={(e) => setSigScale(parseFloat(e.target.value))}
                      className="w-full"
                    />
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">
                      On the card: drag to move, pinch to resize, twist two fingers to rotate.
                    </p>
                  </div>
                )}
                {sigStrokes && (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        Ink color
                      </label>
                      <div className="flex items-center gap-2">
                        {SIG_PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => restyleSignature(c, sigThickness)}
                            className={`h-6 w-6 rounded-full border-2 ${
                              sigColor.toLowerCase() === c.toLowerCase()
                                ? "border-blue-500"
                                : "border-gray-300 dark:border-gray-600"
                            }`}
                            style={{ background: c }}
                            aria-label={`ink ${c}`}
                          />
                        ))}
                        <input
                          type="color"
                          value={sigColor}
                          onChange={(e) => restyleSignature(e.target.value, sigThickness)}
                          className="h-6 w-8 rounded border border-gray-300 dark:border-gray-600 bg-transparent p-0"
                          aria-label="Custom ink color"
                          title="Custom color"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400">
                        Thickness
                      </label>
                      <input
                        type="range"
                        min={3}
                        max={20}
                        step={1}
                        value={sigThickness}
                        onChange={(e) =>
                          restyleSignature(sigColor, parseFloat(e.target.value))
                        }
                        className="w-full"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "bg" && (
            <div className="space-y-4">
              {TEMPLATE_CATEGORIES.map((cat) => {
                const items = TEMPLATES.filter((t) => t.category === cat.key);
                if (items.length === 0) return null;
                return (
                  <div key={cat.key} className="space-y-1.5">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      {cat.label}
                    </h4>
                    <div className="grid grid-cols-3 gap-2 lg:gap-3 lg:[grid-template-columns:repeat(auto-fill,minmax(8.5rem,1fr))]">
                {items.map((t) => {
                  const selected = bg.type === "template" && bg.id === t.id;
                  const lightText = t.textColor === "light";
                  // Global option number — matches the shared "pick a background"
                  // sheet, so a parent's "#12" maps straight back to this swatch.
                  const number = TEMPLATES.indexOf(t) + 1;
                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        setBg({ type: "template", id: t.id });
                        scrollToPreview();
                        track("card_template_picked", { template_id: t.id });
                        logClientActivity("card_template_picked", {
                          template_id: t.id,
                        }).catch(() => {});
                      }}
                      className={`relative aspect-[5/7] rounded-lg overflow-hidden transition-all ${
                        selected
                          ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-offset-gray-900"
                          : ""
                      }`}
                      // container-type lets the mini plate/name below scale with
                      // the swatch (cqw), so bigger swatches read as true minis.
                      style={{ ...t.style, containerType: "inline-size" }}
                      aria-label={t.name}
                    >
                      {/* Mini cutout preview */}
                      {cutoutDataUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cutoutDataUrl}
                          alt=""
                          className="absolute inset-0 w-full h-full pointer-events-none"
                          style={{
                            objectFit: "contain",
                            transform: `translate(${tx * 100}%, ${ty * 100}%) rotate(${rotation}deg) scale(${scale})`,
                            transformOrigin: "center center",
                          }}
                        />
                      )}
                      {/* Mini name plate */}
                      <div
                        style={{
                          position: "absolute",
                          top: "6%",
                          left: 0,
                          pointerEvents: "none",
                        }}
                      >
                        <div
                          style={{
                            background: "#fff",
                            color: "#0a0a0a",
                            padding: "0.2em 0.55em 0.2em 8%",
                            clipPath:
                              "polygon(0 0, 100% 0, calc(100% - 0.4em) 100%, 0 100%)",
                            fontFamily:
                              "var(--font-anton), Impact, sans-serif",
                            fontSize: "7cqw",
                            lineHeight: 1,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {(teamText || "TEAM").slice(0, 10)}
                        </div>
                      </div>
                      {/* Mini player name */}
                      <div
                        style={{
                          position: "absolute",
                          left: "8%",
                          bottom: "6%",
                          pointerEvents: "none",
                          fontFamily: getNameFont(nameFont).family,
                          fontStyle: nameItalic ? "italic" : "normal",
                          color: lightText ? "#fff" : "#111",
                          lineHeight: 0.9,
                          fontSize: `${11 * nameSize}cqw`,
                          textShadow: lightText
                            ? "0 1px 3px rgba(0,0,0,0.55)"
                            : "none",
                        }}
                      >
                        {nameL1 && <div>{nameL1.slice(0, 8)}</div>}
                        {nameL2 && <div>{nameL2.slice(0, 8)}</div>}
                      </div>
                      {/* Option number (UI aid — not part of the card). */}
                      <span
                        style={{
                          position: "absolute",
                          right: "4%",
                          bottom: "4%",
                          pointerEvents: "none",
                          background: "rgba(10,10,10,0.6)",
                          color: "#fff",
                          fontSize: "7.5cqw",
                          fontWeight: 700,
                          lineHeight: 1,
                          padding: "0.28em 0.42em",
                          borderRadius: "0.5em",
                          fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
                        }}
                      >
                        {number}
                      </span>
                    </button>
                  );
                })}
                    </div>
                  </div>
                );
              })}
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
              {cutoutUrl && (
                <div className="space-y-1">
                  <button
                    onClick={exportAllBackgrounds}
                    disabled={exportingAll}
                    className="w-full rounded-lg border border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-3 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/60 disabled:opacity-50"
                  >
                    {exportingAll
                      ? `Rendering ${exportProgress}/${TEMPLATES.length}…`
                      : "📤 Share all backgrounds to pick from"}
                  </button>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    Builds one numbered image of every background with this photo —
                    send it to a parent and they can tell you which numbers they like.
                  </p>
                </div>
              )}
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

              {/* Font picker */}
              <Field label="Name font">
                <div className="grid grid-cols-3 gap-1.5">
                  {NAME_FONTS.map((f) => {
                    const selected = nameFont === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => setNameFont(f.id)}
                        className={`rounded-md border px-2 py-2 text-center transition-colors ${
                          selected
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                            : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        <div
                          style={{
                            fontFamily: f.family,
                            fontSize: "18px",
                            lineHeight: 1,
                          }}
                        >
                          Aa
                        </div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 truncate">
                          {f.name}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Field>

              {/* Size */}
              <Field label={`Size: ${Math.round(nameSize * 100)}%`}>
                <input
                  type="range"
                  min={0.5}
                  max={1.5}
                  step={0.05}
                  value={nameSize}
                  onChange={(e) => setNameSize(parseFloat(e.target.value))}
                  className="w-full"
                />
              </Field>

              {/* Italic toggle */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Italic
                </span>
                <button
                  onClick={() => setNameItalic((v) => !v)}
                  aria-pressed={nameItalic}
                  className={`rounded-md border px-3 py-1 text-xs font-semibold transition-colors ${
                    nameItalic
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                      : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  {nameItalic ? "On" : "Off"}
                </button>
              </div>

              {/* Circulation — limited-edition run size, serialized on the front. */}
              <Field label="Cards in circulation (optional)">
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={circulation}
                  onChange={(e) => setCirculation(e.target.value)}
                  placeholder="e.g. 100"
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
                <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                  Adds a serialized &ldquo;LIMITED EDITION&rdquo; stamp near the jersey number
                  (the preview shows #1). Download the whole run below and each copy is numbered
                  1&thinsp;/&thinsp;{circulation.trim() && Number(circulation) >= 1 ? circulation : "N"} … {circulation.trim() && Number(circulation) >= 1 ? circulation : "N"}&thinsp;/&thinsp;{circulation.trim() && Number(circulation) >= 1 ? circulation : "N"}.
                </p>
                {circulation.trim() && Number.isFinite(Number(circulation)) && Number(circulation) >= 1 && (
                  <button
                    onClick={exportSerializedSet}
                    disabled={exportingSerials}
                    className="mt-2 w-full rounded-lg border border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-3 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/60 disabled:opacity-50"
                  >
                    {exportingSerials
                      ? `Rendering ${serialProgress}/${Math.min(Math.floor(Number(circulation)), SERIAL_CAP)}…`
                      : `⬇︎ Download serialized set (1–${Math.min(Math.floor(Number(circulation)), SERIAL_CAP)})`}
                  </button>
                )}
              </Field>
            </div>
          )}
        </div>
        )}

        {side === "back" && (
          <div className="p-3 space-y-3">
            {/* Headshot (upper-right of the back) */}
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-2">
              <div
                className="h-12 w-12 shrink-0 rounded-full bg-gray-100 dark:bg-gray-800 bg-cover bg-center border border-gray-200 dark:border-gray-700"
                style={
                  headshotDataUrl || headshotUrl
                    ? { backgroundImage: `url(${headshotDataUrl ?? headshotUrl})` }
                    : undefined
                }
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-gray-600 dark:text-gray-300">Headshot</div>
                <div className="text-[11px] text-gray-400 dark:text-gray-500">Upper-right of the back. Drag it in its circle to reposition.</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="flex gap-2">
                  {cutoutUrl && (
                    <button
                      onClick={() => {
                        setHeadshotUrl(cutoutUrl);
                        setHeadshotDataUrl(cutoutDataUrl);
                      }}
                      className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Use card photo
                    </button>
                  )}
                  <button
                    onClick={() => headshotFileRef.current?.click()}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Upload
                  </button>
                </div>
                {(headshotUrl || headshotDataUrl) && (
                  <button
                    onClick={() => {
                      setHeadshotUrl(null);
                      setHeadshotDataUrl(null);
                    }}
                    className="text-xs font-medium text-gray-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                )}
                <input
                  ref={headshotFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleHeadshotSelected(f);
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
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
                  inputMode="numeric"
                  onChange={(e) => {
                    const next = e.target.value;
                    let digits = next.replace(/[^\d]/g, "");
                    // If a delete only stripped a ' or " separator, formatHeight
                    // would just re-add it — drop a digit so backspace advances.
                    if (
                      next.length < stats.height.length &&
                      formatHeight(digits) === stats.height
                    ) {
                      digits = digits.slice(0, -1);
                    }
                    patchStats({ height: formatHeight(digits) });
                  }}
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
              <Field label="Fav practice drill">
                <input
                  value={stats.favorite_drill}
                  onChange={(e) => patchStats({ favorite_drill: e.target.value })}
                  placeholder="Suicides"
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </Field>
            </div>

            <div className="pt-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1.5">
                Coaching staff <span className="font-normal normal-case">(optional)</span>
              </p>
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                <Field label="Coach">
                  <input
                    value={stats.coach}
                    onChange={(e) => patchStats({ coach: e.target.value })}
                    placeholder="Coach Dave"
                    className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  />
                </Field>
                <Field label="Assistant coaches">
                  <input
                    value={stats.assistant_coaches}
                    onChange={(e) => patchStats({ assistant_coaches: e.target.value })}
                    placeholder="Mike, Sarah"
                    className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  />
                </Field>
              </div>
            </div>

            <div className="pt-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1.5">
                Fun questions <span className="font-normal normal-case">(optional)</span>
              </p>
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                <Field label="Biggest fan in the stands">
                  <input
                    value={stats.biggest_fan}
                    onChange={(e) => patchStats({ biggest_fan: e.target.value })}
                    placeholder="Grandma"
                    className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  />
                </Field>
                <Field label="Loudest from the sideline">
                  <input
                    value={stats.loudest_parent}
                    onChange={(e) => patchStats({ loudest_parent: e.target.value })}
                    placeholder="Dad"
                    className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  />
                </Field>
                <Field label="Pre-game hype song">
                  <input
                    value={stats.hype_song}
                    onChange={(e) => patchStats({ hype_song: e.target.value })}
                    placeholder="Eye of the Tiger"
                    className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  />
                </Field>
              </div>
            </div>

            <Field label="Quote for the season">
              <textarea
                value={seasonQuote}
                onChange={(e) => setSeasonQuote(e.target.value)}
                rows={2}
                placeholder="In the player's own words…"
                className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-none"
              />
            </Field>

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
                onChange={(e) => {
                  setLookAlike(e.target.value);
                  setLookAlikePhoto(null); // typed name → drop the AI-matched photo
                  setLookAlikeBlurb(""); // and its AI blurb
                }}
                placeholder="Stephen Curry"
                className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
              <button
                onClick={handleFindLookalike}
                disabled={aiPending !== null}
                className="mt-1 text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
              >
                {aiPending === "lookalike"
                  ? "Finding…"
                  : "✨ Find matches (pick from 10)"}
              </button>
            </Field>
          </div>
        )}
      </div>

      {/* Assign / Save */}
      <div className="mt-4 space-y-2">
        {notice && (
          <p className="text-sm text-green-600 dark:text-green-400">{notice}</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => router.push(returnHref)}
            className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={() => handleSave(standalone ? assignTargetKey || undefined : undefined)}
            disabled={!cutoutUrl || step === "saving" || downloading}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {step === "saving"
              ? standalone && !assignTargetKey
                ? "Exporting…"
                : "Saving…"
              : !standalone
                ? "Save card"
                : assignTargetKey
                  ? `Save to ${assignTargets.find((t) => t.key === assignTargetKey)?.name ?? "player"}`
                  : "Save to Photos"}
          </button>
        </div>

        <button
          onClick={handleDownloadCard}
          disabled={!cutoutUrl || step === "saving" || downloading}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
        >
          {downloading ? "Preparing…" : "⬇︎ Download front & back"}
        </button>

        {/* Raised Foil export — a print-ready CMYK PDF with a RUVgold spot
            channel over the toggled front elements. Separate from the PNG path. */}
        <div className="w-full space-y-2 rounded-lg border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
              Raised Foil PDF{" "}
              <span className="font-normal normal-case text-amber-700/80 dark:text-amber-400/80">
                — print-ready RUVgold spot channel
              </span>
            </p>
            <p className="mt-0.5 text-[11px] text-amber-700/80 dark:text-amber-400/70">
              Pick which front elements get raised foil.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: "name", label: "Name", show: Boolean(nameL1 || nameL2) },
              { key: "team", label: "Team plate", show: true },
              { key: "jersey", label: "Jersey #", show: Boolean(stats.jersey) },
              {
                key: "stamp",
                label: "Limited edition",
                show: Boolean(circulation.trim()),
              },
              {
                key: "signature",
                label: "Signature",
                show: Boolean(sigDataUrl ?? sigUrl),
              },
            ]
              .filter((f) => f.show)
              .map((f) => {
                const on = foilOn.has(f.key);
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => toggleFoil(f.key)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                      on
                        ? "border-amber-500 bg-amber-500 text-white"
                        : "border-amber-300 bg-white text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-gray-900 dark:text-amber-300 dark:hover:bg-amber-950/50"
                    }`}
                  >
                    {on ? "✓ " : ""}
                    {f.label}
                  </button>
                );
              })}
          </div>
          <button
            onClick={handleFoilPdf}
            disabled={!cutoutUrl || foilPending || foilOn.size === 0}
            className="w-full rounded-lg border border-amber-400 bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-200 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200 dark:hover:bg-amber-950/70"
          >
            {foilPending
              ? "Building PDF…"
              : foilOn.size === 0
                ? "Select foil elements above"
                : "✨ Export Raised Foil PDF (RUVgold)"}
          </button>
        </div>

        {allowDrafts && (
          <button
            onClick={handleSaveDraft}
            disabled={!cutoutUrl || step === "saving" || downloading}
            className="w-full rounded-lg border border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-4 py-2 text-sm font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/60 disabled:opacity-50"
          >
            {draftId
              ? "💾 Update draft"
              : assignTargetKey
                ? `💾 Save as draft for ${assignTargets.find((t) => t.key === assignTargetKey)?.name ?? "player"}`
                : "💾 Save as draft (no player yet)"}
          </button>
        )}
      </div>
        </div>
        {/* end controls column */}
      </div>
      {/* end preview / controls grid */}

      {showSigPad && (
        <SignaturePad onCancel={() => setShowSigPad(false)} onDone={handleSignatureDrawn} />
      )}

      {/* Player-match picker — choose one of the AI's ~10 suggestions. */}
      {lookAlikeOptions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-white dark:bg-gray-900 shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 p-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  Pick a player match
                </h3>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Tap one to add it to the card.
                </p>
              </div>
              <button
                onClick={() => setLookAlikeOptions(null)}
                className="text-xs font-medium text-gray-400 hover:text-gray-600"
              >
                Close
              </button>
            </div>
            <div className="space-y-2 overflow-y-auto p-4">
              {lookAlikeOptions.map((o) => (
                <button
                  key={o.name}
                  onClick={() => applyLookalike(o)}
                  className="flex w-full items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-2 text-left hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                >
                  <div
                    className="h-12 w-12 shrink-0 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 bg-cover"
                    style={
                      o.photoUrl
                        ? {
                            backgroundImage: `url(${o.photoUrl})`,
                            backgroundPosition: "center 22%",
                          }
                        : undefined
                    }
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                      {o.name}
                    </div>
                    {o.blurb && (
                      <div className="line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                        {o.blurb}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 p-3">
              <button
                onClick={handleFindLookalike}
                disabled={aiPending !== null}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
              >
                {aiPending === "lookalike" ? "Finding…" : "🔄 Show 10 different players"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Covers the flicker while each serialized copy is rendered. */}
      {exportingSerials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="max-w-xs rounded-2xl bg-white dark:bg-gray-900 px-6 py-5 text-center shadow-xl">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
            <p className="mt-3 text-sm font-semibold text-gray-800 dark:text-gray-100">
              Rendering serialized cards…
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {serialProgress} of{" "}
              {Math.min(Math.floor(Number(circulation)) || 0, SERIAL_CAP)}
            </p>
          </div>
        </div>
      )}

      {/* Covers the flicker while every background is rendered for the sheet. */}
      {exportingAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="max-w-xs rounded-2xl bg-white dark:bg-gray-900 px-6 py-5 text-center shadow-xl">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
            <p className="mt-3 text-sm font-semibold text-gray-800 dark:text-gray-100">
              Building background options…
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {exportProgress} of {TEMPLATES.length}
            </p>
          </div>
        </div>
      )}
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
