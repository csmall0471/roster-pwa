// Minimal back — the editorial front carried over. The header is the front's
// own team block (letter-spaced Bebas over a thin rule, tracked Geist caps).
// Below it, a plain square sheet with no plates: tracked Bebas for the name and
// figures, tiny wide-tracked Geist caps for labels, hairlines between pieces
// and thin accent rules in the team colors.
//
// Sheet tone: dark on dark cards and light on light ones (the front's text
// scheme), unless the picked team colors (black, white and grays aside) only
// read on the other tone: red + black on a dark card gets a light sheet, yellow
// + black on a light card a dark one, so the team color still shows. The sheet
// is nearly opaque, so its text contrast holds over any background.
//
// Colors on the sheet use the front's roles and fall back to the sheet's ink
// when a color would not read: display (player name) = primary; hi (jersey
// figure, coach and match labels) = primary, else secondary; accent (rules) =
// secondary, else primary.

import type { CSSProperties } from "react";
import { FONTS, fitSize, luminance, type BackTheme, type BackThemeProps } from "./shared";
import { BEBAS_EM, inks, MinimalTeam, RULE, teamFit } from "./minimal";

// Luminance range of each sheet over the card's background ([lo, hi]): dark
// cards run from black to mid-tone highlights, light cards from mid-tone to
// white. A color must contrast with both ends to count as reading.
const SHEET_L = {
  dark: { onDark: [0.002, 0.03], onLight: [0.026, 0.05] },
  light: { onDark: [0.8, 0.91], onLight: [0.91, 0.97] },
} as const;

const LABEL_LS = 0.26; // tiny caps tracking (em)
const BAR = 2.6; // short accent rule before a label (u)

function contrast(a: number, b: number) {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Lowest contrast of a color against a sheet's luminance range.
function minContrast(c: string, range: readonly [number, number]) {
  const L = luminance(c);
  return Math.min(contrast(L, range[0]), contrast(L, range[1]));
}

// Black, white and grays carry no team color.
function isNeutral(hex: string) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return true;
  const h = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1];
  const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return Math.max(...rgb) - Math.min(...rgb) < 40;
}

type Sheet = {
  bg: string;
  ink: string; // names, values
  soft: string; // body copy
  muted: string; // labels
  hair: string; // hairlines
  display: string; // player name
  hi: string; // jersey figure, coach + match labels
  accent: string; // rules
};

function sheet(p: BackThemeProps): Sheet {
  const cardDark = luminance(p.textColor) > 0.5;
  const on = cardDark ? "onDark" : "onLight";
  const P = p.palette.background;
  const S = p.palette.subBackground;
  // Pick the tone by the chromatic team colors (yellow + black on a light
  // card goes dark so the yellow shows); two neutrals keep the card's tone.
  const chromatic = [P, S].filter((c) => !isNeutral(c));
  const best = (tone: "dark" | "light") => Math.max(0, ...chromatic.map((c) => minContrast(c, SHEET_L[tone][on])));
  let dark = cardDark;
  if (p.colorSource !== "default" && chromatic.length) {
    const own = best(cardDark ? "dark" : "light");
    const other = best(cardDark ? "light" : "dark");
    if (own < 3 && other > own) dark = !dark;
  }
  const range = SHEET_L[dark ? "dark" : "light"][on];
  const reads = (c: string, min: number) => minContrast(c, range) >= min;
  const ink = dark ? "#ffffff" : "#0a0a0a";
  const rgb = dark ? "255,255,255" : "10,10,10";
  return {
    bg: dark ? "rgba(10,10,12,0.78)" : "rgba(252,252,251,0.92)",
    ink,
    soft: `rgba(${rgb},0.86)`,
    muted: `rgba(${rgb},0.56)`,
    hair: `rgba(${rgb},0.2)`,
    display: reads(P, 3) ? P : ink,
    hi: reads(P, 3) ? P : reads(S, 3) ? S : ink,
    accent: reads(S, 2) ? S : reads(P, 2) ? P : ink,
  };
}

// Tiny wide-tracked Geist caps.
function caps(p: BackThemeProps, size: number, color: string, ls = LABEL_LS): CSSProperties {
  return {
    fontFamily: FONTS.sans,
    fontWeight: 700,
    fontSize: p.u(size),
    letterSpacing: `${ls}em`,
    lineHeight: 1,
    color,
    textTransform: "uppercase",
  };
}

// A short accent rule, then a tiny caps label.
function Label({ p, s, size, color, text }: { p: BackThemeProps; s: Sheet; size: number; color: string; text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: p.u(1.3) }}>
      <div style={{ width: p.u(BAR), height: p.u(RULE * 0.8), background: s.accent, flex: "none" }} />
      <div style={{ ...caps(p, size, color), minWidth: 0, lineHeight: 1.15 }}>{text}</div>
    </div>
  );
}

// The front's team block. Its left edge is the panel's text edge (the layout's
// panel inset + padding) so the header and the sheet share one margin; it is
// centred on the headshot (else on the band above the panel).
function Header({ p }: { p: BackThemeProps }) {
  const side = p.variant === "duo" ? (p.landscape ? 14 : 10) : p.landscape ? 9.8 : 9;
  const right = p.headshot ? p.headshot.left - 3.5 : p.W - side;
  const fit = teamFit(p, right - side);
  const center = p.headshot ? p.headshot.top + p.headshot.size / 2 : p.panelTop / 2;
  const top = Math.max(p.landscape ? 6.5 : 7, Math.min(p.panelTop - 2.5 - fit.teamH, center - fit.teamH / 2));
  return <MinimalTeam p={p} g={{ top, side, ...fit }} ink={inks(p)} />;
}

export const minimalBack: BackTheme = {
  header: (p) => <Header p={p} />,

  // Ring in the front's rule color, as thick as the exporter strokes it.
  headshot: (p) => {
    const ring = inks(p).accent;
    return { style: { border: `${p.u((p.headshot?.size ?? 22) * 0.064)} solid ${ring}` }, ring };
  },

  panel: (p) => {
    const s = sheet(p);
    return {
      background: s.bg,
      borderRadius: 0,
      borderTop: `${p.u(RULE)} solid ${s.accent}`,
      color: s.ink,
      fontFamily: FONTS.sans,
      // The layout spaces some rows in em; a card-relative size keeps those
      // gaps identical at every preview size and in the export.
      fontSize: p.u(2.4),
    };
  },

  name: (p) => {
    const base: CSSProperties = { fontFamily: FONTS.bebas, fontWeight: 400, color: sheet(p).display, textTransform: "uppercase" };
    return p.variant === "duo"
      ? { ...base, letterSpacing: "0.08em", lineHeight: 1.05 }
      : p.landscape
        ? { ...base, letterSpacing: "0.06em", lineHeight: 1.02 }
        : { ...base, letterSpacing: "0.1em", lineHeight: 1.12 };
  },

  // "NO." in tiny caps beside the figure, as on the front.
  jersey: (p, num) => {
    const s = sheet(p);
    return (
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: p.u(1.1), flex: "none", lineHeight: 1 }}>
        <span style={{ ...caps(p, 1.8, s.muted, 0.3) }}>NO.</span>
        <span
          style={{
            fontFamily: FONTS.bebas,
            fontSize: p.u(p.landscape ? 7 : 7.5),
            letterSpacing: "0.02em",
            color: s.hi,
            lineHeight: 1,
          }}
        >
          {num}
        </span>
      </span>
    );
  },

  // Label over figure, columns split by hairlines.
  stat: (p, k, v) => {
    const s = sheet(p);
    const size = fitSize(v.toUpperCase(), p.landscape ? 4.4 : 4.6, 14.5, BEBAS_EM, 0.04);
    return (
      <div
        style={{
          minWidth: 0,
          borderLeft: `1px solid ${s.hair}`,
          paddingLeft: p.u(1.6),
          // Landscape stacks the stats 2 × 2 with no row gap.
          marginBottom: p.landscape ? p.u(1.8) : 0,
          display: "flex",
          flexDirection: "column",
          gap: p.u(0.9),
        }}
      >
        <div style={{ ...caps(p, 1.6, s.muted, 0.24), whiteSpace: "nowrap" }}>{k}</div>
        <div
          style={{
            fontFamily: FONTS.bebas,
            fontSize: p.u(size),
            lineHeight: 0.9,
            letterSpacing: "0.04em",
            color: s.ink,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {v}
        </div>
      </div>
    );
  },

  label: (p, text) => {
    const s = sheet(p);
    return (
      <div style={{ marginBottom: p.u(p.landscape ? 0.7 : 0.9) }}>
        <Label p={p} s={s} size={p.landscape ? 1.7 : 1.8} color={s.muted} text={text} />
      </div>
    );
  },

  // Pull quote: tracked Bebas behind a thin accent rule.
  quote: (p, text) => {
    const s = sheet(p);
    return (
      <div style={{ borderLeft: `${p.u(RULE)} solid ${s.accent}`, paddingLeft: p.u(2.4) }}>
        <p
          style={{
            margin: 0,
            fontFamily: FONTS.bebas,
            fontSize: p.u(p.landscape ? 3.3 : 3.5),
            lineHeight: 1.1,
            letterSpacing: "0.05em",
            color: s.ink,
          }}
        >
          &ldquo;{text}&rdquo;
        </p>
      </div>
    );
  },

  body: (p) => ({
    fontSize: p.u(p.landscape ? 2.6 : 2.75),
    lineHeight: p.landscape ? 1.28 : 1.32,
    fontWeight: 400,
    color: sheet(p).soft,
    margin: 0,
  }),

  qa: (p, label, value) => {
    const s = sheet(p);
    return p.variant === "duo" ? (
      <div style={{ display: "flex", flexDirection: "column", gap: p.u(0.8), marginBottom: p.u(0.8), minWidth: 0 }}>
        <Label p={p} s={s} size={2} color={s.hi} text={label} />
        <span style={{ fontSize: p.u(3.5), fontWeight: 600, lineHeight: 1.2, color: s.ink }}>{value}</span>
      </div>
    ) : (
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: p.u(p.landscape ? 0.35 : 0.45) }}>
        <div style={{ ...caps(p, p.landscape ? 1.55 : 1.6, s.muted, 0.2), lineHeight: p.landscape ? 1 : 1.05 }}>{label}</div>
        <div
          style={{
            fontSize: p.u(p.landscape ? 2.65 : 2.75),
            fontWeight: 600,
            color: s.ink,
            lineHeight: p.landscape ? 1.12 : 1.15,
            overflowWrap: "anywhere",
          }}
        >
          {value}
        </div>
      </div>
    );
  },

  // A ruled row (accent rule over it, no fill).
  match: (p, m) => {
    const s = sheet(p);
    const duo = p.variant === "duo";
    const L = !duo && p.landscape;
    return (
      <div
        style={{
          ...(duo ? { flex: "0 0 auto" } : {}),
          borderTop: `${p.u(RULE)} solid ${s.accent}`,
          padding: `${p.u(L ? 1 : 1.3)} 0 ${p.u(L ? 0.3 : 0.6)}`,
          display: "flex",
          alignItems: "center",
          gap: p.u(L ? 2.4 : 2.8),
        }}
      >
        {m.photos({
          width: duo ? p.u(10) : L ? "11%" : "12%",
          aspectRatio: "1 / 1",
          flexShrink: 0,
          borderRadius: "9999px",
          border: `${p.u(0.6)} solid ${s.accent}`,
        })}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ ...caps(p, L ? 1.6 : 1.7, s.hi), whiteSpace: "nowrap" }}>{m.label}</div>
          <div
            style={{
              fontFamily: FONTS.bebas,
              fontSize: p.u(duo ? 4.4 : L ? 4.2 : 4.6),
              lineHeight: 1,
              letterSpacing: "0.06em",
              color: s.ink,
              marginTop: p.u(L ? 0.7 : 0.9),
              ...(duo ? {} : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }),
            }}
          >
            {m.name}
          </div>
          {m.blurb && (
            <p
              style={{
                margin: `${p.u(L ? 0.5 : 0.6)} 0 0`,
                fontSize: p.u(L ? 2.1 : 2.3),
                lineHeight: L ? 1.15 : 1.2,
                fontWeight: 400,
                fontStyle: "italic",
                color: s.muted,
              }}
            >
              {m.blurb}
            </p>
          )}
        </div>
      </div>
    );
  },

  matchRing: (p) => sheet(p).accent,

  coach: (p, label, value) => {
    const s = sheet(p);
    // Shrink a long staff list toward one line in its column (estimated for
    // two coaches side by side; landscape solo stacks them), then wrap.
    const duo = p.variant === "duo";
    const avail = duo ? (p.landscape ? 50 : 36) : p.landscape ? 42 : 38;
    const size = Math.max(duo ? 2.8 : 3, fitSize(value.toUpperCase(), duo ? 3.4 : 3.6, avail, BEBAS_EM, 0.06));
    return (
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: p.u(0.8) }}>
        <div style={{ ...caps(p, 1.7, s.hi), whiteSpace: "nowrap" }}>{label}</div>
        <div
          style={{
            fontFamily: FONTS.bebas,
            fontSize: p.u(size),
            lineHeight: 1.05,
            letterSpacing: "0.06em",
            color: s.ink,
          }}
        >
          {value}
        </div>
      </div>
    );
  },

  divider: (p) => ({
    borderTop: `1px solid ${sheet(p).hair}`,
    paddingTop: p.u(p.variant === "duo" ? 2 : p.landscape ? 1.4 : 1.6),
  }),
};
