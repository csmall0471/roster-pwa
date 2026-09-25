// Front-card decorative frames — a two-band border plus colored plates behind
// the team name (top) and player name (bottom), so the player info reads as part
// of a trading-card border. Everything is plain CSS colors + text placed in the
// captured overlay layer, so it exports on iOS like the rest of the overlay
// (no raster). Sizes are expressed as % of the card width and applied via
// calc(var(--cardw) * n / 100) at render, so a frame scales with the preview.

export const NO_FRAME = "none";

export type CardFrame = {
  id: string;
  name: string;
  // Two-band border.
  band: string; // outer band color
  keyline: string; // thin inner keyline color
  // Player-name plate (bar behind the bottom name). null = plain text.
  namePlate: { background: string; color: string } | null;
  // Team-plate colors (top chevron chips) — overrides the default white/black.
  teamPlate: { background: string; color: string; subBackground: string; subColor: string };
};

// Outer band inset from the card edge (kept off the very edge so print trim
// can't clip it unevenly) and the two band thicknesses, as % of card width.
export const FRAME_INSET_PCT = 2.5;
export const FRAME_BAND_PCT = 3;
export const FRAME_KEYLINE_PCT = 0.7;
// Where the name/team plates sit horizontally — just inside the inner band.
export const FRAME_PLATE_INSET_PCT = FRAME_INSET_PCT + FRAME_BAND_PCT + 0.5;

export const FRAMES: CardFrame[] = [
  {
    id: "frame-usa",
    name: "USA",
    band: "#1e3a8a",
    keyline: "#dc2626",
    namePlate: { background: "#dc2626", color: "#ffffff" },
    teamPlate: { background: "#1e3a8a", color: "#ffffff", subBackground: "#dc2626", subColor: "#ffffff" },
  },
  {
    id: "frame-redzone",
    name: "Red Zone",
    band: "#b91c1c",
    keyline: "#ffffff",
    namePlate: { background: "#b91c1c", color: "#ffffff" },
    teamPlate: { background: "#111827", color: "#ffffff", subBackground: "#b91c1c", subColor: "#ffffff" },
  },
  {
    id: "frame-bluechip",
    name: "Blue Chip",
    band: "#1d4ed8",
    keyline: "#ffffff",
    namePlate: { background: "#1d4ed8", color: "#ffffff" },
    teamPlate: { background: "#0b1f4a", color: "#ffffff", subBackground: "#1d4ed8", subColor: "#ffffff" },
  },
  {
    id: "frame-blackgold",
    name: "Blackout Gold",
    band: "#0a0a0a",
    keyline: "#d4af37",
    namePlate: { background: "#0a0a0a", color: "#f5d67b" },
    teamPlate: { background: "#d4af37", color: "#0a0a0a", subBackground: "#0a0a0a", subColor: "#f5d67b" },
  },
  {
    id: "frame-emerald",
    name: "Emerald",
    band: "#047857",
    keyline: "#ffffff",
    namePlate: { background: "#047857", color: "#ffffff" },
    teamPlate: { background: "#052e21", color: "#ffffff", subBackground: "#047857", subColor: "#ffffff" },
  },
  {
    id: "frame-orangecrush",
    name: "Orange Crush",
    band: "#ea580c",
    keyline: "#0a0a0a",
    namePlate: { background: "#ea580c", color: "#ffffff" },
    teamPlate: { background: "#0a0a0a", color: "#ffffff", subBackground: "#ea580c", subColor: "#ffffff" },
  },
  {
    id: "frame-purplereign",
    name: "Purple Reign",
    band: "#6d28d9",
    keyline: "#facc15",
    namePlate: { background: "#6d28d9", color: "#ffffff" },
    teamPlate: { background: "#2e1065", color: "#ffffff", subBackground: "#facc15", subColor: "#2e1065" },
  },
  {
    id: "frame-silver",
    name: "Silver Prizm",
    band: "#94a3b8",
    keyline: "#0a0a0a",
    namePlate: { background: "#111827", color: "#ffffff" },
    teamPlate: { background: "#e2e8f0", color: "#0a0a0a", subBackground: "#111827", subColor: "#ffffff" },
  },
];

export function getFrame(id: string | null | undefined): CardFrame | null {
  if (!id || id === NO_FRAME) return null;
  return FRAMES.find((f) => f.id === id) ?? null;
}
