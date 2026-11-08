// Shared building blocks for the card-front designs.
//
// A front design draws every text element on the card front as one matched
// set: the team block (team · age · season), the jersey number, the player
// name and, optionally, the coaches. Each design lives in its own file in this
// folder and is registered in ./index.tsx.
//
// EXPORT RULES (the front overlay is captured with html-to-image through an
// SVG foreignObject, and iOS Safari drops raster images there):
//   - Only solid colors / CSS gradients, borders, border-radius, clip-path,
//     transforms, text-shadow and filter: drop-shadow(). No images, no
//     background-clip:text, no -webkit-text-stroke, no box-shadow on rounded
//     elements (it rasterizes as a rectangle).
//   - Size everything with the unit function `u` (percent of the card's SHORT
//     edge) or with em/% — never px — so the card looks identical at every
//     preview size and in the export. px drop-shadows are fine but skip them
//     when `compact` is set (tiny thumbnails).
//   - Avoid inline formatting contexts for stacked pieces (inline-block inside
//     a plain div picks up the page's line-height strut and the gap changes
//     with preview size). Stack with flex / inline-flex columns instead.
//
// PRINT RULES: the card is trimmed with up to ~1/32" drift. Keep text at least
// SAFE (5u) inside the trim. A plate may run off an edge (bleed) only if it
// clearly extends past it; anything that ends near an edge must stop at least
// 2.5u inside it. With a frame, keep everything inside `p.inset` from every
// edge (the frame band) and clear of the keyline.

import type { CSSProperties, ReactNode } from "react";
import type { CardFrame } from "../frames";

// ── Units ────────────────────────────────────────────────────────────────────

export type CardUnit = (n: number) => string;
// Live card: --cardw is the card's short edge in px.
export const cardWidthUnit: CardUnit = (n) => `calc(var(--cardw, 22rem) * ${n} / 100)`;
// Thumbnails: the parent sets containerType: "inline-size"; scale converts the
// container width to the short edge (5/7 for a landscape thumbnail).
export const containerUnit = (scale = 1): CardUnit => (n) => `${+(n * scale).toFixed(3)}cqw`;

// Card size in u: portrait 100 × 140, landscape 140 × 100.
export function cardSize(landscape: boolean) {
  return landscape ? { W: 140, H: 100 } : { W: 100, H: 140 };
}

// Minimum distance (u) between any text and the trim edge.
export const SAFE = 5;

// ── Fonts ────────────────────────────────────────────────────────────────────

export const FONTS = {
  anton: "var(--font-anton), Impact, sans-serif",
  bebas: "var(--font-bebas), Impact, sans-serif",
  oswald: "var(--font-oswald), Impact, sans-serif", // only weight 700 is loaded
  archivo: "var(--font-archivo-black), Impact, sans-serif",
  bungee: "var(--font-bungee), Impact, sans-serif",
  stencil: "var(--font-black-ops), Impact, sans-serif",
  marker: "var(--font-marker), Impact, sans-serif",
  sans: "var(--font-geist-sans), system-ui, sans-serif", // use 600–800 weights
} as const;
export type FontKey = keyof typeof FONTS;

// Average advance width of an UPPERCASE character, in em (measured with the
// real fonts over team/name/coach samples). Add letter-spacing on top.
export const FONT_EM: Record<FontKey, number> = {
  anton: 0.442,
  bebas: 0.361,
  oswald: 0.5,
  archivo: 0.706,
  bungee: 0.657,
  stencil: 0.654,
  marker: 0.622,
  sans: 0.624,
};

// Largest font size (u) ≤ base at which `text` fits in `avail` u, for a font
// whose average uppercase advance is `em` (+ letterSpacing in em). Use it for
// every single-line, nowrap piece of user text so long names shrink instead
// of running into other elements or off the card.
export function fitSize(text: string, base: number, avail: number, em: number, letterSpacing = 0): number {
  const n = Math.max(1, [...text].length);
  const need = n * (em + letterSpacing); // em
  const fit = avail / need;
  return Math.max(0.5, Math.round(Math.min(base, fit) * 100) / 100);
}

// Extra space (u) to leave ABOVE a line of text whose capitals carry accents
// (Á É Í Ó Ú Ñ …): the marks rise ~0.16–0.25em above cap height, so stacked
// lines spaced by cap height collide with the line above. 0 for plain text.
export function accentLift(text: string, size: number, ratio = 0.26): number {
  return /[\u0300-\u036f]/.test(text.toUpperCase().normalize("NFD")) ? size * ratio : 0;
}

// ── Colors ───────────────────────────────────────────────────────────────────

// background/color = the main (team-name) plate; subBackground/subColor = the
// secondary strip (age · season), accents, stripes, 3D shadow and so on.
export type TeamPalette = {
  background: string;
  color: string;
  subBackground: string;
  subColor: string;
};

export const CLASSIC_PALETTE: TeamPalette = {
  background: "#ffffff",
  color: "#0a0a0a",
  subBackground: "#0a0a0a",
  subColor: "#ffffff",
};

// "user" = the coach picked team colors; "frame" = following the frame's
// colors; "default" = nothing picked (white/black). Text-only designs follow
// the card's light/dark text scheme only when the source is "default".
export type ColorSource = "user" | "frame" | "default";

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// WCAG relative luminance, 0 (black) … 1 (white).
export function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Readable text color on a background: white or near-black.
export function contrastText(bg: string): string {
  const L = luminance(bg);
  const onWhite = (L + 0.05) / 0.05; // contrast of black text
  const onBlack = 1.05 / (L + 0.05); // contrast of white text
  return onBlack >= onWhite * 0.9 ? "#ffffff" : "#0a0a0a";
}

export function isDark(hex: string): boolean {
  return luminance(hex) < 0.18;
}

export function paletteFromColors(primary: string, secondary: string): TeamPalette {
  return {
    background: primary,
    color: contrastText(primary),
    subBackground: secondary,
    subColor: contrastText(secondary),
  };
}

// Quick picks for the two team-color pickers (any hex is allowed).
export const QUICK_TEAM_COLORS: Array<{ name: string; hex: string }> = [
  { name: "White", hex: "#ffffff" },
  { name: "Black", hex: "#0a0a0a" },
  { name: "Red", hex: "#c8102e" },
  { name: "Maroon", hex: "#7a1f2b" },
  { name: "Orange", hex: "#ea580c" },
  { name: "Gold", hex: "#d4af37" },
  { name: "Yellow", hex: "#facc15" },
  { name: "Green", hex: "#16a34a" },
  { name: "Forest", hex: "#065f46" },
  { name: "Teal", hex: "#0f766e" },
  { name: "Sky", hex: "#7dd3fc" },
  { name: "Royal", hex: "#1d4ed8" },
  { name: "Navy", hex: "#0b1f4a" },
  { name: "Purple", hex: "#6d28d9" },
  { name: "Pink", hex: "#db2777" },
  { name: "Silver", hex: "#cbd5e1" },
  { name: "Gray", hex: "#4b5563" },
];

// Palette ids saved by the short-lived preset-palette picker (Nov 2026), mapped
// to [primary, secondary]. Reopened cards keep those colors but follow the
// two-color rules (contrast text, colored jersey/back). No live card used one.
const LEGACY_TEAM_COLORS: Record<string, [string, string]> = {
  white: ["#ffffff", "#0a0a0a"],
  black: ["#0a0a0a", "#ffffff"],
  red: ["#c8102e", "#0a0a0a"],
  royal: ["#1d4ed8", "#0a0a0a"],
  "navy-gold": ["#0b1f4a", "#d4af37"],
  gold: ["#d4af37", "#0a0a0a"],
  green: ["#047857", "#0a0a0a"],
  teal: ["#0f766e", "#f97316"],
  orange: ["#ea580c", "#0a0a0a"],
  purple: ["#6d28d9", "#facc15"],
  pink: ["#db2777", "#0a0a0a"],
  silver: ["#e2e8f0", "#334155"],
};

export function legacyTeamColors(id: string | null | undefined): [string, string] | null {
  return id ? LEGACY_TEAM_COLORS[id] ?? null : null;
}

// Picked colors win; otherwise follow the frame; otherwise white/black. Either
// color may be picked alone — the other keeps what the card shows without a
// pick (the frame's color when a frame is on, else the classic white/black).
export function resolveTeamPalette(
  primary: string | null | undefined,
  secondary: string | null | undefined,
  frame: CardFrame | null | undefined
): { palette: TeamPalette; source: ColorSource } {
  if (primary || secondary) {
    const base = frame ? frame.teamPlate : CLASSIC_PALETTE;
    return {
      palette: {
        background: primary || base.background,
        color: primary ? contrastText(primary) : base.color,
        subBackground: secondary || base.subBackground,
        subColor: secondary ? contrastText(secondary) : base.subColor,
      },
      source: "user",
    };
  }
  if (frame) return { palette: frame.teamPlate, source: "frame" };
  return { palette: CLASSIC_PALETTE, source: "default" };
}

// ── Coaches ──────────────────────────────────────────────────────────────────

export type Coaches = { head: string; assistants: string };

// Uppercased, ready-to-print coach lines. Either may be null.
export function coachLines(c: Coaches | null | undefined): { head: string | null; assistants: string | null } {
  if (!c) return { head: null, assistants: null };
  const head = c.head.trim();
  const asst = c.assistants
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    head: head ? `COACH ${head.toUpperCase()}` : null,
    assistants: asst.length ? `ASST. ${asst.join(", ").toUpperCase()}` : null,
  };
}

// Both lines joined, for designs with room for a single coach line.
export function coachText(c: Coaches | null | undefined, sep = "  ·  "): string {
  const { head, assistants } = coachLines(c);
  return [head, assistants].filter(Boolean).join(sep);
}

// ── Design contract ──────────────────────────────────────────────────────────

export type FrontDesignProps = {
  u: CardUnit;
  landscape: boolean;
  W: number; // card width in u (100 portrait, 140 landscape)
  H: number; // card height in u (140 portrait, 100 landscape)
  // Active decorative frame (border drawn by the editor), or null. When set,
  // keep every element at least `inset` u from each edge.
  frame: CardFrame | null;
  inset: number;
  palette: TeamPalette;
  colorSource: ColorSource;
  team: string; // display text, may be ""
  age: string; // may be ""
  season: string; // may be ""
  jersey: string; // number without "#", "" = no jersey
  // Solo card: [line 1, line 2] (usually FIRST, LAST; either may be "").
  // Group card: one line, e.g. "CJ & ALEX & SAM".
  nameLines: string[];
  isGroup: boolean;
  nameFont: { family: string; em: number };
  nameSize: number; // user multiplier 0.5–1.5
  nameItalic: boolean;
  coaches: Coaches | null; // null = coaches hidden
  // The card's light/dark title scheme (white text with a dark shadow on dark
  // backgrounds, near-black on light ones).
  textColor: string;
  textShadow: string;
  compact: boolean; // tiny thumbnail: skip px drop-shadows
};

export type FrontDesign = {
  id: string;
  name: string;
  // Name font (id from ../name-fonts) applied when this design is picked; the
  // user can still change it afterwards.
  nameFont: string;
  // Returns absolutely-positioned elements laid over the card (the parent is
  // the card-sized overlay, position: relative/absolute, inset 0).
  render: (p: FrontDesignProps) => ReactNode;
  // Where the "LIMITED EDITION n / N" stamp goes (top-right by default, below
  // the jersey when there is one). Override if the jersey sits elsewhere.
  circulation?: (p: FrontDesignProps) => { top: string; right: string };
};

export function defaultCirculation(p: FrontDesignProps): { top: string; right: string } {
  return { top: p.jersey ? "18.5%" : "6.5%", right: "7%" };
}

// Common absolute wrapper.
export function abs(style: CSSProperties): CSSProperties {
  return { position: "absolute", pointerEvents: "none", ...style };
}

// drop-shadow filter unless compact.
export function shadow(p: FrontDesignProps, css = "drop-shadow(0 4px 10px rgba(0,0,0,0.45))"): CSSProperties {
  return p.compact ? {} : { filter: css };
}

export function teamOrPlaceholder(p: FrontDesignProps) {
  return p.team || "TEAM";
}

export function subLine(p: FrontDesignProps, sep = " · ") {
  return [p.age, p.season].filter(Boolean).join(sep);
}
