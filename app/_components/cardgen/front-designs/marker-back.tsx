// Marker back — the scrapbook page behind the Marker front. The header is the
// front's own taped team block; the headshot is stuck on a round team-color
// sticker and circled by hand, like the front's jersey sticker; the content
// panel is a sheet of kraft paper held on with a strip of clear tape, with:
//   - the player name on a big primary tape and the jersey on a mini sticker;
//   - stat chips as small tags in the two team colors under clear tape;
//   - section labels, coach labels and the duo's questions on thin tapes;
//   - the season quote hand-lettered in marker;
//   - the player / duo match on a long secondary tape.
//
// Text sits either on the kraft paper (dark ink, ≥ 4.5:1) or on a tape in a
// team color with that color's contrast-paired text.

import type { CSSProperties, ReactNode } from "react";
import { FONTS, SAFE, abs, backNameFamily, luminance, shadow, type BackTheme, type BackThemeProps } from "./shared";
import { MK, SIN, TAPE_SHADOW, TILT_TEAM, Tape, Team, tapeBg, teamMetrics, torn, type Geo } from "./marker";

// Kraft paper and inks.
const PAPER = "#d7bf98";
const INK = "#1f170e";
const INK_LABEL = "#5a3b19"; // small handwritten labels on the paper
const INK_RULE = "rgba(31,23,14,0.38)";

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// A team color that reads as marker ink on the paper (quote marks), else ink.
function paperAccent(p: BackThemeProps): string {
  for (const c of [p.palette.background, p.palette.subBackground]) if (contrast(c, PAPER) >= 3) return c;
  return INK;
}

// Hand-drawn ring on a primary sticker: the secondary color unless it would
// vanish on the sticker (same rule as the front's jersey sticker).
function stickerRing(p: BackThemeProps): string {
  const P = p.palette;
  return Math.abs(luminance(P.subBackground) - luminance(P.background)) > 0.06 ? P.subBackground : P.color;
}

// Clear tape: a translucent strip with faint fibres.
function clearTape(p: BackThemeProps): string {
  return [
    `repeating-linear-gradient(100deg, rgba(255,255,255,0.10) 0 ${p.u(0.3)}, rgba(255,255,255,0) ${p.u(0.3)} ${p.u(1.1)})`,
    "linear-gradient(180deg, rgba(255,255,255,0.58), rgba(255,255,255,0.42))",
  ].join(", ");
}

// ── Header ───────────────────────────────────────────────────────────────────

const HS_MARGIN = 2.2; // sticker margin around the headshot circle (u)
const HS_PANEL_GAP = 0.5; // the sticker stops at least this far above the panel (u)
const HS_RING = 0.064; // the exporter strokes the headshot ring at 6.4% of its size

// The sticker's margin around the headshot: HS_MARGIN, clamped so the sticker
// ends above the kraft panel (the landscape headshot sits only 1.2u above it),
// which would otherwise cover its bottom and break the hand-drawn loop.
function hsMargin(p: BackThemeProps): number {
  const h = p.headshot!;
  return Math.max(0, Math.min(HS_MARGIN, p.panelTop - HS_PANEL_GAP - (h.top + h.size)));
}

function Header({ p }: { p: BackThemeProps }) {
  // The front's team block (no jersey). Its plates stop 3u short of the
  // headshot (else at the print-safe line), and it shrinks as needed so its
  // lowest corner stays 1.5u above the panel. The block tilts about its
  // right-top corner, so its left end drops by width·sinθ.
  const right = p.headshot ? p.headshot.left - 3 : p.W - SAFE;
  const limit = p.panelTop - 1.5;
  let g: Geo = { edge: 3.5, top: 4.5, jersey: null, plateRight: right - 1.1 };
  for (let k = 1; k >= 0.5; k -= 0.05) {
    g = { ...g, teamScale: k };
    const m = teamMetrics(p, g);
    if (g.top + m.height + m.width * SIN(TILT_TEAM) + 0.3 <= limit) break;
  }
  return (
    <>
      <Team p={p} g={g} />
      {p.headshot && <HeadshotSticker p={p} />}
      <PanelTape p={p} />
    </>
  );
}

// The round team-color sticker behind the headshot, circled by hand.
function HeadshotSticker({ p }: { p: BackThemeProps }) {
  const h = p.headshot!;
  const m = hsMargin(p);
  const D = h.size + 2 * m;
  // The loop is drawn in the margin band outside the photo; a narrower band
  // pulls it toward the sticker's edge and thins the strokes a little.
  const k = m / HS_MARGIN;
  const at = (n: number) => p.u(n * k);
  const ring = stickerRing(p);
  return (
    <div
      style={abs({
        left: p.u(h.left - m),
        top: p.u(h.top - m),
        width: p.u(D),
        height: p.u(D),
        ...shadow(p, TAPE_SHADOW),
      })}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: tapeBg(p, p.palette.background),
          borderRadius: "51% 49% 52% 48% / 49% 52% 48% 51%",
          transform: "rotate(7deg)",
        }}
      />
      {/* one full loop plus an overshooting second stroke */}
      <div
        style={{
          position: "absolute",
          inset: at(0.5),
          border: `${p.u(Math.max(0.3, 0.42 * k))} solid ${ring}`,
          borderRadius: "49% 51% 50% 50% / 52% 48% 52% 48%",
          transform: "rotate(-14deg)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: `${at(0.2)} ${at(0.65)} ${at(0.55)} ${at(0.25)}`,
          border: `${p.u(Math.max(0.24, 0.32 * k))} solid transparent`,
          borderTopColor: ring,
          borderLeftColor: ring,
          borderRadius: "50%",
          transform: "rotate(28deg)",
        }}
      />
    </div>
  );
}

// A strip of clear tape holding the paper on at the top, centred on the panel
// (the panel is centred in every layout). Drawn over the panel.
function PanelTape({ p }: { p: BackThemeProps }) {
  const w = p.landscape ? 17 : 15;
  const h = 3.4;
  return (
    <div
      style={abs({
        left: p.u(p.W / 2 - w / 2),
        top: p.u(p.panelTop - h / 2),
        width: p.u(w),
        height: p.u(h),
        zIndex: 2,
        background: clearTape(p),
        clipPath: torn(p, 3, 0.6),
        transform: "rotate(-3deg)",
      })}
    />
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

// Stable small index per label so tilts / colors alternate along a row.
function idx(s: string): number {
  let n = 0;
  for (const c of s) n += c.charCodeAt(0);
  return n;
}

const STAT_TILTS = [-2, 1.6, -1.2, 2];
// The layout's stat order; anything else falls back to a hash.
const STAT_ORDER = ["POS", "HT", "#", "AGE"];

function Stat({ p, k, v }: { p: BackThemeProps; k: string; v: string }) {
  const o = STAT_ORDER.indexOf(k);
  const i = o >= 0 ? o : idx(k);
  const primary = i % 2 === 0;
  const bg = primary ? p.palette.background : p.palette.subBackground;
  const fg = primary ? p.palette.color : p.palette.subColor;
  // Values are short (PG, 4'2", 23); shrink the longer ones to stay on one line.
  const n = [...v].length;
  const vs = Math.min(3.5, Math.max(2.2, 12.5 / (n * 0.66)));
  return (
    <div
      style={{
        position: "relative",
        minWidth: 0,
        // The landscape 2 × 2 grid has no usable row gap; space the rows here.
        margin: p.landscape ? `${p.u(0.5)} 0` : 0,
        transform: `rotate(${STAT_TILTS[i % STAT_TILTS.length]}deg)`,
        ...shadow(p, "drop-shadow(0 1px 1.5px rgba(0,0,0,0.35))"),
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          background: tapeBg(p, bg),
          color: fg,
          padding: `${p.u(0.95)} ${p.u(0.9)} ${p.u(0.5)}`,
          clipPath: torn(p, i, 0.55),
          borderRadius: p.u(0.3),
        }}
      >
        <div style={{ fontFamily: MK, fontSize: p.u(1.6), lineHeight: 1, letterSpacing: "0.08em", opacity: 0.72 }}>{k}</div>
        <div
          style={{
            fontFamily: MK,
            fontSize: p.u(vs),
            lineHeight: 1.1,
            marginTop: p.u(0.2),
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {v}
        </div>
      </div>
      {/* scrap of clear tape across the top */}
      <div
        style={{
          position: "absolute",
          left: "28%",
          width: "44%",
          top: p.u(-1),
          height: p.u(1.5),
          background: clearTape(p),
          clipPath: torn(p, i + 1, 0.4),
          transform: `rotate(${-STAT_TILTS[i % STAT_TILTS.length] * 1.5}deg)`,
        }}
      />
    </div>
  );
}

// Small label tape (section heads, coach labels, duo questions).
function LabelTape({
  p,
  text,
  size,
  seed,
  tilt,
  primary = false,
  wrap = false,
  style,
}: {
  p: BackThemeProps;
  text: string;
  size: number;
  seed: number;
  tilt: number;
  primary?: boolean;
  wrap?: boolean; // user text: wrap instead of running past the column
  style?: CSSProperties;
}) {
  return (
    <div style={{ display: "flex", ...style }}>
      <Tape
        p={p}
        bg={primary ? p.palette.background : p.palette.subBackground}
        fg={primary ? p.palette.color : p.palette.subColor}
        seed={seed}
        depth={0.45}
        pad={[0.26, 1.1, 0.12, 1.1]}
        style={{
          fontFamily: MK,
          fontSize: p.u(size),
          letterSpacing: "0.06em",
          lineHeight: 1.1,
          transform: `rotate(${tilt}deg)`,
          transformOrigin: "left center",
          ...(wrap ? { whiteSpace: "normal", maxWidth: "100%" } : {}),
        }}
      >
        {text}
      </Tape>
    </div>
  );
}

// Diameter of the jersey sticker beside the panel name (u).
const jerseyD = (p: BackThemeProps) => (p.landscape ? 9.6 : 11);

function Jersey({ p, num }: { p: BackThemeProps; num: string }) {
  const D = jerseyD(p);
  const ring = stickerRing(p);
  const glyphs = [...num].length * 1.06 + 0.6 * 1.13;
  const fs = Math.max(2, Math.min(p.landscape ? 4.2 : 4.8, ((D - 4.2) * 0.95) / (glyphs * 0.622)));
  return (
    <div
      style={{
        position: "relative",
        flex: "0 0 auto",
        width: p.u(D),
        height: p.u(D),
        // Let the sticker overhang its row instead of making the row taller.
        margin: `${p.u(-1.6)} 0 ${p.u(-1.6)} 0`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...shadow(p, "drop-shadow(0 1px 2px rgba(0,0,0,0.35))"),
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: tapeBg(p, p.palette.background),
          borderRadius: "52% 48% 55% 45% / 47% 55% 45% 53%",
          transform: "rotate(7deg)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: p.u(1),
          border: `${p.u(0.38)} solid ${ring}`,
          borderRadius: "46% 54% 50% 50% / 55% 45% 55% 45%",
          transform: "rotate(-14deg)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: `${p.u(0.75)} ${p.u(1.3)} ${p.u(1.15)} ${p.u(0.8)}`,
          border: `${p.u(0.3)} solid transparent`,
          borderTopColor: ring,
          borderLeftColor: ring,
          borderRadius: "50%",
          transform: "rotate(28deg)",
        }}
      />
      <span
        style={{
          position: "relative",
          display: "flex",
          alignItems: "baseline",
          fontFamily: MK,
          fontSize: p.u(fs),
          lineHeight: 1,
          color: p.palette.color,
          transform: "rotate(-6deg)",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: "0.6em", marginRight: "0.04em" }}>#</span>
        {num}
      </span>
    </div>
  );
}

function Match({ p, m }: { p: BackThemeProps; m: Parameters<BackTheme["match"]>[1] }) {
  const duo = p.variant === "duo";
  const L = !duo && p.landscape;
  const ringC = matchRingColor(p);
  return (
    <div
      style={{
        ...(duo ? { flex: "0 0 auto" } : {}),
        position: "relative",
        color: p.palette.subColor,
        padding: `${p.u(L ? 1.1 : 1.25)} ${p.u(2.6)} ${p.u(L ? 1.1 : 1.25)} ${p.u(2.2)}`,
        display: "flex",
        alignItems: "center",
        gap: p.u(L ? 1.8 : 2.2),
        ...shadow(p, TAPE_SHADOW),
      }}
    >
      {/* the tape, tilted on its own so the photo boxes stay square to the card */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: tapeBg(p, p.palette.subBackground),
          clipPath: torn(p, 2, 1),
          transform: "rotate(-0.8deg)",
        }}
      />
      {m.photos({
        width: duo ? p.u(10) : L ? "13%" : "13.5%",
        aspectRatio: "1 / 1",
        flexShrink: 0,
        borderRadius: "9999px",
        border: `${p.u(0.55)} solid ${ringC}`,
        position: "relative",
      })}
      <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: MK, fontSize: p.u(L ? 1.8 : 1.9), letterSpacing: "0.1em", lineHeight: 1.1, opacity: 0.75 }}>
          {m.label}
        </div>
        <div
          style={{
            fontFamily: MK,
            fontSize: p.u(duo ? 3.8 : L ? 4 : 4.6),
            lineHeight: 1.12,
            letterSpacing: "0.02em",
            ...(duo ? {} : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }),
          }}
        >
          {m.name}
        </div>
        {m.blurb && (
          <p
            style={{
              margin: `${p.u(0.3)} 0 0`,
              fontSize: p.u(L ? 2.2 : 2.4),
              lineHeight: 1.2,
              fontWeight: 600,
              fontStyle: "italic",
              opacity: 0.88,
            }}
          >
            {m.blurb}
          </p>
        )}
      </div>
    </div>
  );
}

// Ring around match photos: the primary color on the secondary tape when it
// shows, else the tape's own text color.
function matchRingColor(p: BackThemeProps): string {
  const P = p.palette;
  return Math.abs(luminance(P.background) - luminance(P.subBackground)) > 0.06 ? P.background : P.subColor;
}

// ── Theme ────────────────────────────────────────────────────────────────────

export const markerBack: BackTheme = {
  header: (p) => <Header p={p} />,

  headshot: (p) => {
    const bg = p.palette.background;
    const w = (p.headshot?.size ?? 22) * HS_RING;
    // Same ring the exporter strokes, in the sticker color: the photo looks
    // set into the sticker.
    return { style: { border: `${p.u(w)} solid ${bg}` }, ring: bg };
  },

  panel: (p) => ({
    background: [
      "linear-gradient(172deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0) 38%, rgba(60,35,10,0.07) 100%)",
      `repeating-linear-gradient(96deg, rgba(90,58,20,0.05) 0 ${p.u(0.3)}, rgba(90,58,20,0) ${p.u(0.3)} ${p.u(1.15)})`,
      `repeating-linear-gradient(4deg, rgba(255,255,255,0.06) 0 ${p.u(0.25)}, rgba(255,255,255,0) ${p.u(0.25)} ${p.u(1.8)})`,
      PAPER,
    ].join(", "),
    borderRadius: `${p.u(0.6)} ${p.u(1.2)} ${p.u(0.5)} ${p.u(0.9)} / ${p.u(0.9)} ${p.u(0.6)} ${p.u(1.1)} ${p.u(0.5)}`,
    color: INK,
    fontFamily: FONTS.sans,
    // Scale the layout's em gaps with the card (instead of the page's 16px).
    fontSize: p.u(2.6),
    ...shadow(p, "drop-shadow(0 3px 6px rgba(0,0,0,0.42))"),
  }),

  name: (p) => {
    const ls = 0.01;
    const padX = p.landscape ? 0.32 : 0.36; // em, each side of the tape
    const tape: CSSProperties = {
      // The user's font when the name fits beside the jersey sticker at the
      // layout's size, else a narrower display face (never an ellipsis or a
      // mid-word break).
      fontFamily: backNameFamily(p, { jerseyW: jerseyD(p), padEm: 2 * padX, letterSpacing: ls }),
      fontStyle: p.nameItalic ? "italic" : "normal",
      color: p.palette.color,
      background: tapeBg(p, p.palette.background),
      clipPath: torn(p, 1, 0.8),
      letterSpacing: `${ls}em`,
      textTransform: "uppercase",
    };
    if (p.variant === "duo")
      return { ...tape, alignSelf: "flex-start", maxWidth: "100%", padding: "0.08em 0.36em 0.03em", lineHeight: 1.06, transform: "rotate(-1deg)" };
    // The layout lets the name grow to the jersey; max-content keeps the tape
    // the length of the name.
    return {
      ...tape,
      maxWidth: "max-content",
      padding: `0.08em ${padX}em ${p.landscape ? 0.02 : 0.03}em`,
      lineHeight: p.landscape ? 1.08 : 1.06,
      transform: "rotate(-1.2deg)",
      transformOrigin: "left center",
    };
  },

  jersey: (p, num) => <Jersey p={p} num={num} />,

  stat: (p, k, v) => <Stat p={p} k={k} v={v} />,

  label: (p, text) => (
    <LabelTape p={p} text={text} size={p.landscape ? 1.9 : 2} seed={idx(text)} tilt={-1.4} style={{ marginBottom: p.u(0.55) }} />
  ),

  quote: (p, text) => {
    const a = paperAccent(p);
    return (
      <p
        style={{
          margin: 0,
          fontFamily: MK,
          fontSize: p.u(p.landscape ? 2.7 : 2.8),
          lineHeight: 1.3,
          letterSpacing: "0.01em",
          color: INK,
        }}
      >
        <span style={{ color: a }}>&ldquo;</span>
        {text}
        <span style={{ color: a }}>&rdquo;</span>
      </p>
    );
  },

  body: (p) => ({
    fontSize: p.u(2.7),
    lineHeight: p.landscape ? 1.28 : 1.3,
    fontWeight: 600,
    color: INK,
    margin: 0,
  }),

  qa: (p, label, value): ReactNode =>
    p.variant === "duo" ? (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: p.u(0.5), minWidth: 0 }}>
        <LabelTape p={p} text={label.toUpperCase()} size={2.3} seed={idx(label)} tilt={idx(label) % 2 ? 1 : -1.2} wrap />
        <span style={{ fontSize: p.u(3.6), lineHeight: 1.18, fontWeight: 600, color: INK }}>{value}</span>
      </div>
    ) : (
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: MK, fontSize: p.u(1.75), letterSpacing: "0.07em", color: INK_LABEL, lineHeight: 1.08 }}>
          {label}
        </div>
        <div style={{ fontSize: p.u(2.7), fontWeight: 700, color: INK, lineHeight: 1.14, overflowWrap: "anywhere" }}>{value}</div>
      </div>
    ),

  match: (p, m) => <Match p={p} m={m} />,

  matchRing: (p) => matchRingColor(p),

  coach: (p, label, value) => (
    <div style={{ minWidth: 0 }}>
      <LabelTape p={p} text={label} size={1.9} seed={idx(label) + 1} tilt={1.2} primary style={{ marginBottom: p.u(0.5) }} />
      <div
        style={{
          fontFamily: MK,
          fontSize: p.u(3),
          lineHeight: 1.1,
          letterSpacing: "0.02em",
          color: INK,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </div>
    </div>
  ),

  divider: (p) => ({
    borderTop: `${p.u(0.3)} dashed ${INK_RULE}`,
    paddingTop: p.u(p.landscape ? 1.6 : 1.8),
  }),
};
