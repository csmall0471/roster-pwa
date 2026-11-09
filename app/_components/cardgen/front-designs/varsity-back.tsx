// Varsity back — the letterman jacket's inside: the front's 3D Bungee team
// block on top, then a dark felt patch with a thin double-rule border in the
// team color. On the felt: the player name and jersey number in the same
// outlined 3D lettering as the front, stat chips as sewn-on patches (dashed
// stitching), Oswald caps labels with double hairlines, the front's felt
// stripe above the coaches, and the player match as a pennant with a hoist
// band and a pointed fly end.
//
// Colors: the felt is the darker team color deepened (charcoal when both are
// light or nothing was picked); `hi` is the team color that reads on the felt
// (the letters, rules, chips, pennant) and `lo` the other one (the letters'
// felt ring, the pennant's hoist band, the stripe's core).
//
// Attached to the design in ./index.tsx (not in ./varsity), so the import of
// ./varsity here is one-way.

import type { CSSProperties } from "react";
import { FONTS, FONT_EM, contrastText, fitSize, luminance, type BackTheme, type BackThemeProps } from "./shared";
import {
  CAP,
  EXT_LT,
  EXT_RB,
  VarsityTeamBlock,
  contrast,
  fontOf,
  inks,
  letterShadow,
  shade,
  textEm,
  type Ink,
} from "./varsity";

// ── Colors ───────────────────────────────────────────────────────────────────

function rgbOf(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// Mix toward white (amt 0…1).
function tint(hex: string, amt: number) {
  return `#${rgbOf(hex)
    .map((v) => Math.round(v + (255 - v) * amt).toString(16).padStart(2, "0"))
    .join("")}`;
}
function alpha(hex: string, a: number) {
  const [r, g, b] = rgbOf(hex);
  return `rgba(${r},${g},${b},${a})`;
}
// Raise `hex` toward white until it reads on `bg` at `min`:1.
function readable(hex: string, bg: string, min: number) {
  for (let a = 0; a <= 1.001; a += 0.05) {
    const c = tint(hex, a);
    if (contrast(c, bg) >= min) return c;
  }
  return "#ffffff";
}

type BackInk = {
  felt: string; // the panel surface
  hi: string; // the team color that reads on the felt
  hiText: string; // text on a `hi` surface
  lo: string; // the other team color
  acc: string; // small labels on the felt (≥ 4.5:1)
  letter: Ink; // 3D lettering on the felt
  front: Ink; // the front's inks (header, headshot — on the card background)
};

function backInks(p: BackThemeProps): BackInk {
  const front = inks(p);
  if (p.colorSource === "default") {
    // Labels a step down from the white lettering.
    return { felt: "#151515", hi: "#ffffff", hiText: "#0a0a0a", lo: "#0a0a0a", acc: "#c9c9c9", letter: front, front };
  }
  const a = p.palette.background;
  const b = p.palette.subBackground;
  const dark = luminance(a) <= luminance(b) ? a : b;
  // Felt: the darker team color, deepened until white text reads at ≥ 10:1;
  // a little lifted when it is black so the felt still has a surface.
  let felt = "#161616";
  if (luminance(dark) <= 0.2) {
    felt = dark;
    for (let t = 0.05; luminance(felt) > 0.03 && t <= 1; t += 0.05) felt = shade(dark, t);
    if (luminance(felt) < 0.007) felt = tint(felt, 0.05);
  }
  // hi: the primary when it reads on the felt, else the secondary, else the
  // stronger of the two raised toward white until it does.
  const ca = contrast(a, felt);
  const cb = contrast(b, felt);
  const base = ca >= 3 ? a : cb >= 3 ? b : ca >= cb ? a : b;
  const hi = readable(base, felt, 3);
  const other = base === a ? b : a;
  // Same color twice: the ring/hoist falls back to the readable text color.
  const lo = contrast(other, hi) < 1.15 ? contrastText(hi) : other;
  return {
    felt,
    hi,
    hiText: contrastText(hi),
    lo,
    acc: readable(hi, felt, 4.5),
    letter: { fill: hi, ring: lo, edge: contrastText(lo), depth: shade(lo, 0.45) },
    front,
  };
}

// ── Geometry (u) — mirrors the layout in CardBack / CardBackDuo ───────────────

const BORDER = 1.1; // the panel's double rule
const HASH = 0.42; // "#" size relative to the number
const HASH_GAP = 0.12; // em of the "#"
const HASH_W = 0.75; // Bungee "#" advance, em

function contentW(p: BackThemeProps) {
  if (p.variant === "duo") return (p.landscape ? 126 : 90) - 2 * (p.landscape ? 7 : 5) - 2 * BORDER;
  return p.landscape ? 140 * 0.92 - 2 * 4.2 - 2 * BORDER : 90 - 2 * 4 - 2 * BORDER;
}
// Landscape solo: left column (name, stats, coaches) and right column.
const leftColW = (p: BackThemeProps) => contentW(p) * 0.36;
const rightColW = (p: BackThemeProps) => contentW(p) * (1 - 0.36 - 0.035);

function jerseyW(size: number, num: string) {
  return size * (HASH * (HASH_W + HASH_GAP) + textEm("bungee", num, FONT_EM.bungee) + EXT_RB);
}

function playerName(p: BackThemeProps) {
  return (p.nameLines.filter(Boolean).join(" ") || (p.variant === "duo" ? "THE DUO" : "PLAYER")).toUpperCase();
}
// CardBack's landscape name size steps (it sets the size; we only pick a font).
function landscapeNameSize(p: BackThemeProps) {
  const n = (p.nameLines.filter(Boolean).join(" ") || "PLAYER").length;
  return n > 12 ? 4.4 : n > 8 ? 5.3 : 6.5;
}

// Width (u) of `text` at `size` in a font family (measured where we can).
function widthIn(family: string, avgEm: number, text: string, size: number) {
  // + the 3D lettering past the advance (outline left, outline + drop right).
  return (textEm(fontOf(family), text, avgEm) + 0.01 * [...text].length + EXT_LT + EXT_RB) * size;
}

type Face = { family: string; capTop: number; lh: number };

// The name row. The layout fixes the name's size, so a long name is kept whole
// by first stepping the jersey number down (8 → 7u, portrait) and then setting
// the name in condensed Bebas instead of the design's name font. The name gets
// one line (two in the narrow landscape column, words never broken).
function nameRow(p: BackThemeProps): { face: Face; jersey: number } {
  const name = playerName(p);
  const own = { family: p.nameFont.family, em: p.nameFont.em };
  const bebas = { family: FONTS.bebas, em: FONT_EM.bebas };
  const L = p.variant === "solo" && p.landscape;
  const steps: Array<[{ family: string; em: number }, number]> =
    p.variant === "duo" || L
      ? [[own, 6], [bebas, 6]]
      : [[own, 8], [own, 7], [bebas, 8], [bebas, 7], [bebas, 6]];
  const fits = ([c, j]: (typeof steps)[number]) => {
    if (p.variant === "duo") return widthIn(c.family, c.em, name, 7) <= contentW(p);
    const jw = p.jersey ? jerseyW(j, p.jersey) : 0;
    if (!L) return widthIn(c.family, c.em, name, 7) <= contentW(p) * 0.94 - jw;
    const size = landscapeNameSize(p);
    const avail = leftColW(p) * 0.96 - jw;
    const space = textEm(fontOf(c.family), " ", c.em) * size;
    let lines = 1;
    let w = 0;
    for (const word of name.split(/\s+/).filter(Boolean)) {
      const ww = widthIn(c.family, c.em, word, size);
      if (ww > avail) return false;
      if (w && w + space + ww > avail) {
        lines++;
        w = ww;
      } else w += (w ? space : 0) + ww;
    }
    return lines <= 2;
  };
  const [c, jersey] = steps.find(fits) ?? steps[steps.length - 1];
  const f = fontOf(c.family);
  const cap = f ? CAP[f] : { top: 0.1, h: 0.75 };
  // Line height that keeps the outline + 3D drop inside the line box (the
  // layout clips the name): half-leading + cap bottom + drop ≤ line height.
  const lh = Math.max(1.08, +(2 * (cap.top + cap.h + DROP) - 1).toFixed(3));
  return { face: { family: c.family, capTop: cap.top, lh }, jersey };
}
const DROP = 0.175; // outline + 3D drop below the baseline, em

// Small lettering: the felt ring runs out to the edge (no contrasting hairline,
// which turns to noise at small sizes); the fill alone reads on the felt.
function fineLetter(k: Ink): Ink {
  return { ...k, edge: k.ring };
}

// ── Pieces ───────────────────────────────────────────────────────────────────

const oswald = (p: BackThemeProps, size: number, extra?: CSSProperties): CSSProperties => ({
  fontFamily: FONTS.oswald,
  fontWeight: 700,
  fontSize: p.u(size),
  lineHeight: 1,
  ...extra,
});

// The front's felt stripe (band / core / band, 1.06u) as a background image.
function stripe(p: BackThemeProps, band: string, core: string) {
  const a = p.u(0.28);
  const b = p.u(0.78);
  const c = p.u(1.06);
  return `linear-gradient(to bottom, ${band} 0, ${band} ${a}, ${core} ${a}, ${core} ${b}, ${band} ${b}, ${band} ${c})`;
}

export const varsityBack: BackTheme = {
  // The front's team block, fitted to end 3u before the headshot.
  header: (p) => <VarsityTeamBlock p={p} right={p.headshot ? p.headshot.left - 3 : undefined} />,

  // Like a front letter: the photo is the fill, then the felt ring (secondary),
  // a contrasting hairline edge and the stepped 3D drop. The ring is a border
  // the exporter re-strokes (6.4% of the size); the edge and drop sit outside
  // the box, so the canvas photo never covers them.
  headshot: (p) => {
    const k = backInks(p).front;
    const size = p.headshot?.size ?? 22;
    const e = p.u(0.4);
    const d = p.u(0.7);
    return {
      style: {
        border: `${p.u(size * 0.064)} solid ${k.ring}`,
        filter: [
          `drop-shadow(${e} 0 0 ${k.edge})`,
          `drop-shadow(calc(-1 * ${e}) 0 0 ${k.edge})`,
          `drop-shadow(0 ${e} 0 ${k.edge})`,
          `drop-shadow(0 calc(-1 * ${e}) 0 ${k.edge})`,
          `drop-shadow(${d} ${d} 0 ${k.depth})`,
          ...(p.compact ? [] : ["drop-shadow(0 3px 6px rgba(0,0,0,0.35))"]),
        ].join(" "),
      },
      ring: k.ring,
    };
  },

  // Dark felt with a soft top light and a double-rule border in the team color.
  // fontSize sets the layout's em gaps in card units (they otherwise follow the
  // page's font size and change with the preview size).
  panel: (p) => {
    const b = backInks(p);
    return {
      background: `radial-gradient(130% 70% at 50% 0%, ${tint(b.felt, 0.07)} 0%, ${b.felt} 60%, ${shade(b.felt, 0.35)} 100%)`,
      border: `${p.u(BORDER)} double ${b.hi}`,
      borderRadius: p.u(3.2),
      color: "#ffffff",
      fontFamily: FONTS.sans,
      fontSize: p.u(2.8),
    };
  },

  name: (p) => {
    const b = backInks(p);
    const { face } = nameRow(p);
    const small = p.variant === "solo" && p.landscape && landscapeNameSize(p) < 5.5;
    return {
      fontFamily: face.family,
      fontStyle: "normal",
      color: b.letter.fill,
      textShadow: letterShadow(small ? fineLetter(b.letter) : b.letter),
      letterSpacing: "0.01em",
      lineHeight: face.lh,
      textTransform: "uppercase",
      // Room for the outline on the left (the layout clips overflow).
      paddingLeft: `${EXT_LT + 0.01}em`,
    };
  },

  // The front's number: a raised small "#" and the 3D Bungee digits. Baseline
  // aligned with the name (portrait); cap tops aligned (landscape).
  jersey: (p, num) => {
    const b = backInks(p);
    const { face, jersey: s } = nameRow(p);
    const ts = letterShadow(b.letter);
    const lh = face.lh;
    let mt = 0;
    if (p.landscape) {
      const capTop = (top: number, size: number) => ((lh - 1) / 2 + top) * size;
      mt = capTop(face.capTop, landscapeNameSize(p)) - capTop(CAP.bungee.top, s);
    }
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "baseline",
          flex: "none",
          fontFamily: FONTS.bungee,
          fontSize: p.u(s),
          lineHeight: lh,
          color: b.letter.fill,
          marginTop: mt ? p.u(mt) : undefined,
          marginRight: `${EXT_RB - 0.03}em`,
        }}
      >
        <span
          style={{
            fontSize: `${HASH}em`,
            position: "relative",
            top: `${-((1 - HASH) * CAP.bungee.h) / HASH}em`,
            marginRight: `${HASH_GAP}em`,
            textShadow: ts,
          }}
        >
          #
        </span>
        <span style={{ textShadow: ts }}>{num}</span>
      </span>
    );
  },

  // A sewn-on patch: team color, dashed stitching just inside the edge.
  stat: (p, label, value) => {
    const b = backInks(p);
    // Worst case: four chips across (portrait) / two per row (landscape).
    const chipW = p.landscape ? (leftColW(p) * 0.95) / 2 : (contentW(p) * 0.94) / 4;
    const avail = chipW - 2.2;
    const size = Math.max(2.2, fitSize(value, 3.4, avail, textEm("bungee", value.toUpperCase(), FONT_EM.bungee) / Math.max(1, [...value].length)));
    return (
      <div style={{ background: b.hi, color: b.hiText, borderRadius: p.u(1.5), padding: p.u(0.4), minWidth: 0 }}>
        <div
          style={{
            border: `1px dashed ${alpha(b.hiText, 0.42)}`,
            borderRadius: p.u(1.15),
            padding: `${p.u(0.8)} ${p.u(0.4)} ${p.u(0.9)}`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: p.u(0.6),
            minWidth: 0,
          }}
        >
          <div style={oswald(p, 1.6, { letterSpacing: "0.18em", marginRight: "-0.18em", opacity: 0.72 })}>{label}</div>
          <div
            style={{
              fontFamily: FONTS.bungee,
              fontSize: p.u(size),
              lineHeight: 1,
              textTransform: "uppercase",
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {value}
          </div>
        </div>
      </div>
    );
  },

  // Oswald caps in the team color, then a thin double hairline to the edge.
  label: (p, text) => {
    const b = backInks(p);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: p.u(1.4), marginBottom: p.u(p.landscape ? 0.9 : 1.1) }}>
        <span style={oswald(p, p.landscape ? 1.9 : 2, { letterSpacing: "0.22em", color: b.acc, whiteSpace: "nowrap" })}>{text}</span>
        <span
          style={{
            flex: "1 1 auto",
            height: p.u(0.7),
            borderTop: `1px solid ${alpha(b.acc, 0.55)}`,
            borderBottom: `1px solid ${alpha(b.acc, 0.55)}`,
          }}
        />
      </div>
    );
  },

  quote: (p, text) => {
    const b = backInks(p);
    return (
      <div style={{ borderLeft: `${p.u(1.1)} double ${b.hi}`, paddingLeft: p.u(1.8) }}>
        <p
          style={{
            fontSize: p.u(p.landscape ? 2.8 : 3),
            lineHeight: p.landscape ? 1.28 : 1.3,
            fontStyle: "italic",
            fontWeight: 600,
            color: "#ffffff",
            margin: 0,
          }}
        >
          &ldquo;{text}&rdquo;
        </p>
      </div>
    );
  },

  body: (p) => ({
    fontSize: p.u(p.landscape ? 2.7 : 2.8),
    lineHeight: p.landscape ? 1.3 : 1.34,
    color: "rgba(255,255,255,0.9)",
    margin: 0,
  }),

  qa: (p, label, value) => {
    const b = backInks(p);
    return p.variant === "duo" ? (
      <div style={{ display: "flex", flexDirection: "column", gap: p.u(0.8), minWidth: 0 }}>
        <span style={oswald(p, 2.3, { letterSpacing: "0.14em", textTransform: "uppercase", color: b.acc })}>{label}</span>
        <span style={oswald(p, 3.4, { lineHeight: 1.18, color: "#ffffff", overflowWrap: "anywhere" })}>{value}</span>
      </div>
    ) : (
      // Box-score style: the label runs in ahead of the answer, which wraps in
      // its own column.
      <div style={{ display: "flex", alignItems: "baseline", gap: p.u(1), minWidth: 0 }}>
        <span style={oswald(p, 1.8, { flex: "none", letterSpacing: "0.12em", color: b.acc })}>{label}</span>
        <span style={oswald(p, 2.7, { flex: "1 1 auto", minWidth: 0, lineHeight: 1.16, color: "#ffffff", overflowWrap: "anywhere" })}>
          {value}
        </span>
      </div>
    );
  },

  // A pennant: team-color felt with a hoist band in the other color, dashed
  // stitching top and bottom, and a pointed fly end.
  match: (p, m) => {
    const b = backInks(p);
    const duo = p.variant === "duo";
    const L = !duo && p.landscape;
    const photo = duo ? 9.5 : L ? 9.5 : 11.5;
    const n = duo ? 2 : 1;
    const point = L ? 3.4 : 4;
    const hoist = L ? 1.4 : 1.6;
    const padL = L ? 1.6 : 2;
    const gap = L ? 2 : 2.4;
    const bannerW = duo ? contentW(p) : L ? rightColW(p) : contentW(p);
    const textW = bannerW - hoist - padL - n * photo - (n - 1) * 1.1 - gap - point - 1.2;
    const base = duo ? 4.4 : L ? 4.6 : 5.2;
    const nameSize = Math.max(3, fitSize(m.name, base, textW, (textEm("bungee", m.name, FONT_EM.bungee) + 0.2) / Math.max(1, [...m.name].length)));
    const ring = varsityBack.matchRing(p);
    const stitch = alpha(b.hiText, 0.4);
    const seam = (pos: "top" | "bottom"): CSSProperties => ({
      position: "absolute",
      left: p.u(0.6),
      right: 0,
      [pos]: p.u(0.65),
      borderTop: `1px dashed ${stitch}`,
      pointerEvents: "none",
    });
    return (
      <div
        style={{
          ...(duo ? { flex: "0 0 auto" } : {}),
          position: "relative",
          background: b.hi,
          color: b.hiText,
          borderLeft: `${p.u(hoist)} solid ${b.lo}`,
          clipPath: `polygon(0 0, calc(100% - ${p.u(point)}) 0, 100% 50%, calc(100% - ${p.u(point)}) 100%, 0 100%)`,
          padding: `${p.u(L ? 1.25 : 1.45)} ${p.u(point + 1.2)} ${p.u(L ? 1.25 : 1.45)} ${p.u(padL)}`,
          display: "flex",
          alignItems: "center",
          gap: p.u(gap),
        }}
      >
        <div style={seam("top")} />
        <div style={seam("bottom")} />
        {m.photos({
          width: p.u(photo),
          aspectRatio: "1 / 1",
          flexShrink: 0,
          borderRadius: "9999px",
          border: `${p.u(0.6)} solid ${ring}`,
        })}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: p.u(L ? 0.6 : 0.7) }}>
          <div style={oswald(p, L ? 1.8 : 1.9, { letterSpacing: "0.22em", opacity: 0.72 })}>{m.label}</div>
          <div
            style={{
              fontFamily: FONTS.bungee,
              fontSize: p.u(nameSize),
              lineHeight: 1.05,
              letterSpacing: "0.01em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {m.name}
          </div>
          {m.blurb && (
            <p
              style={{
                margin: 0,
                fontSize: p.u(L ? 2.2 : 2.4),
                lineHeight: L ? 1.18 : 1.22,
                fontWeight: 600,
                fontStyle: "italic",
                opacity: 0.85,
              }}
            >
              {m.blurb}
            </p>
          )}
        </div>
      </div>
    );
  },

  matchRing: (p) => {
    const b = backInks(p);
    return contrast(b.lo, b.hi) >= 1.5 ? b.lo : b.hiText;
  },

  coach: (p, label, value) => {
    const b = backInks(p);
    return (
      <div style={{ minWidth: 0 }}>
        <div style={oswald(p, 1.8, { letterSpacing: "0.16em", color: b.acc, marginBottom: p.u(0.6) })}>{label}</div>
        <div
          style={oswald(p, p.variant === "duo" ? 3 : p.landscape ? 2.8 : 3.1, {
            lineHeight: 1.1,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "#ffffff",
          })}
        >
          {value}
        </div>
      </div>
    );
  },

  // The front's felt stripe, in the felt's colors (team-color bands).
  divider: (p) => {
    const b = backInks(p);
    return {
      backgroundImage: stripe(p, b.hi, b.lo),
      backgroundRepeat: "no-repeat",
      backgroundPosition: "0 0",
      backgroundSize: `100% ${p.u(1.06)}`,
      paddingTop: p.u(p.variant === "duo" ? 2.2 : p.landscape ? 1.6 : 1.9),
    };
  },
};
