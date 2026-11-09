// Ribbon back — the award-ribbon language of the Ribbon front carried over:
// Oswald 700 tracked caps, swallowtail notches, sewn (dashed) stitch rules and
// stars, in the team's two colors.
//   - header: the front's team ribbons (no pennant); with a headshot, the photo
//     sits on a pleated prize rosette in the primary color;
//   - panel: a solid primary "cloth" plate with a stitched inner border, so
//     its text reads on any card background;
//   - jersey: a small secondary pennant hanging from the panel's top edge;
//   - stats: ribbon tails (notched bottoms); section labels: small notched
//     ribbons; player/duo match: a notched, stitched banner;
//   - stars mark the quote and the question / match labels, as they flank the
//     first name on the front.
// The pieces in the secondary color fall back to a deeper fold of the panel
// color when the two team colors are too close to tell apart.
//
// Attached to the design in ./index.tsx, so the import of ./ribbon is one-way.

import type { CSSProperties } from "react";
import {
  FONTS,
  FONT_EM,
  SAFE,
  backNameFamily,
  fitSize,
  isDark,
  shadow,
  type BackTheme,
  type BackThemeProps,
} from "./shared";
import { Ribbon, RibbonTeamBlock, Star, Stitch, contrast, pennantClip, shade } from "./ribbon";

const OSWALD = FONTS.oswald;
const DROP = "drop-shadow(0 3px 7px rgba(0,0,0,0.45))";
const SHEEN =
  "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 28%, rgba(0,0,0,0) 72%, rgba(0,0,0,0.08) 100%)";

// Stitch pattern (u), as on the front.
const DASH = 1.25;
const GAP = 0.75;

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbDistance(a: string, b: string) {
  const x = rgb(a);
  const y = rgb(b);
  return x && y ? Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) : 0;
}

function colors(p: BackThemeProps) {
  const pal = p.palette;
  const primary = pal.background;
  const ink = pal.color;
  // Secondary pieces need to stand apart from the primary panel: enough
  // luminance contrast, or clearly different colors (teal vs orange).
  const subOk = contrast(pal.subBackground, primary) >= 1.6 || rgbDistance(pal.subBackground, primary) >= 120;
  const fold = isDark(primary)
    ? `linear-gradient(rgba(255,255,255,0.2), rgba(255,255,255,0.2)), ${primary}`
    : shade(primary, 0.22);
  return {
    primary,
    ink,
    // Solid color for canvas rings / borders (never a gradient).
    sub: subOk ? pal.subBackground : ink,
    // Tabs, pennant, label ribbons, match banner.
    tab: subOk ? pal.subBackground : fold,
    tabInk: subOk ? pal.subColor : ink,
    tabStitch: subOk ? primary : ink,
    // Text and small marks set directly on the panel.
    accent: contrast(pal.subBackground, primary) >= 3 ? pal.subBackground : ink,
    // The panel's stitched border.
    stitch: subOk ? pal.subBackground : ink,
  };
}

function caps(size: string, ls: number, extra?: CSSProperties): CSSProperties {
  return {
    fontFamily: OSWALD,
    fontWeight: 700,
    fontSize: size,
    letterSpacing: `${ls}em`,
    lineHeight: 1.12,
    whiteSpace: "nowrap",
    ...extra,
  };
}

// Panel top padding (u) the layout sets: 4% (portrait) / 2.4% (landscape) of
// the card width.
function panelPadTop(p: BackThemeProps) {
  return p.landscape ? 0.024 * p.W : 0.04 * p.W;
}

// ── Header: team ribbons + the headshot rosette ─────────────────────────────

// How far the rosette's pleats reach past the photo circle (u): as far as the
// room above the panel allows (the panel paints over the header), so in
// landscape, where the photo ends just above the panel, it is a narrow ruff.
function ruffle(p: BackThemeProps) {
  const want = p.landscape ? 2.2 : 2.4;
  const hs = p.headshot;
  if (!hs) return want;
  return Math.max(0, Math.min(want, p.panelTop - 0.5 - (hs.top + hs.size)));
}

function Rosette({ p }: { p: BackThemeProps }) {
  const hs = p.headshot;
  if (!hs) return null;
  const c = colors(p);
  const e = ruffle(p);
  if (e < 0.3) return null;
  const size = hs.size + 2 * e;
  // Pleated edge: 2N points alternating between the outer radius and a notch
  // (shallower on a narrow ruff, so the notches stay outside the photo).
  const N = 34;
  const inner = 50 - (Math.min(0.95, 0.4 * e) / size) * 100;
  const pts: string[] = [];
  for (let i = 0; i < 2 * N; i++) {
    const a = (i * Math.PI) / N;
    const r = i % 2 === 0 ? 50 : inner;
    pts.push(`${+(50 + r * Math.sin(a)).toFixed(3)}% ${+(50 - r * Math.cos(a)).toFixed(3)}%`);
  }
  const step = 360 / N;
  return (
    <div
      style={{
        position: "absolute",
        pointerEvents: "none",
        left: p.u(hs.left - e),
        top: p.u(hs.top - e),
        width: p.u(size),
        height: p.u(size),
        ...shadow(p, DROP),
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          clipPath: `polygon(${pts.join(", ")})`,
          background: `repeating-conic-gradient(from ${-step / 4}deg, rgba(0,0,0,0.2) 0deg ${step / 2}deg, rgba(255,255,255,0.12) ${step / 2}deg ${step}deg), ${c.primary}`,
        }}
      />
      {/* Sewn ring between the pleats and the photo (when there is room). */}
      {e >= 1.4 && (
        <div
          style={{
            position: "absolute",
            inset: p.u(e * 0.36),
            borderRadius: "9999px",
            border: `${p.u(0.28)} dashed ${c.stitch}`,
          }}
        />
      )}
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

// Jersey pennant width (u).
function pennantW(p: BackThemeProps) {
  return p.landscape ? 9 : 10;
}

function JerseyPennant({ p, num }: { p: BackThemeProps; num: string }) {
  const c = colors(p);
  const L = p.landscape;
  const pad = panelPadTop(p);
  const w = pennantW(p);
  const depth = L ? 2.6 : 3;
  // Height below the panel's top padding; the rest hangs into the gap under
  // the name row without growing it.
  const below = L ? 8.6 : 9.4;
  const rowH = L ? 6.6 : 7;
  const h = pad + below;
  const layers: Array<[number, string]> = [
    [0, c.tab],
    [0.5, c.tabStitch],
    [0.82, c.tab],
  ];
  const n = Math.max(1, [...num].length);
  // Oswald digits ≈ 0.56em; "#" drawn at 0.45×.
  const size = Math.min(L ? 5.4 : 6, (w - 2 * 0.82 - 1.8) / ((n + 0.45) * 0.56));
  const numTop = Math.max(1.2, pad - 1.6);
  const numBottom = h - depth + 0.4;
  return (
    <div
      style={{
        position: "relative",
        flex: "none",
        alignSelf: "flex-start",
        width: p.u(w),
        height: p.u(h),
        marginTop: p.u(-pad),
        marginBottom: p.u(-(below - rowH)),
        ...shadow(p, "drop-shadow(0 2px 3px rgba(0,0,0,0.35))"),
      }}
    >
      {layers.map(([b, bg]) => (
        <div
          key={b}
          style={{ position: "absolute", inset: 0, background: bg, clipPath: pennantClip(w, h, depth, b, false) }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: p.u(numTop),
          height: p.u(numBottom - numTop),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: c.tabInk,
          fontFamily: OSWALD,
          fontWeight: 700,
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: p.u(size * 0.45) }}>#</span>
        <span style={{ fontSize: p.u(size), letterSpacing: "0.02em" }}>{num}</span>
      </div>
    </div>
  );
}

// A star-led caps label in the accent color (questions, coaches).
function StarLabel({ p, text, size, ls }: { p: BackThemeProps; text: string; size: number; ls: number }) {
  const c = colors(p);
  return (
    <div
      style={caps(p.u(size), ls, {
        display: "flex",
        alignItems: "center",
        gap: "0.42em",
        lineHeight: 1.04,
        color: c.accent,
        overflow: "hidden",
        textOverflow: "ellipsis",
      })}
    >
      <Star size="0.72em" color={c.accent} />
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{text}</span>
    </div>
  );
}

function stitchRule(p: BackThemeProps, color: string, deg: 90 | 180) {
  return `repeating-linear-gradient(${deg}deg, ${color} 0 ${p.u(DASH)}, transparent ${p.u(DASH)} ${p.u(DASH + GAP)})`;
}

// ── Theme ────────────────────────────────────────────────────────────────────

export const ribbonBack: BackTheme = {
  header: (p) => {
    // Clear of the rosette (same ruff width it is drawn with).
    const limit = p.headshot ? p.headshot.left - 3 - ruffle(p) : p.W - SAFE;
    return (
      <>
        <Rosette p={p} />
        <RibbonTeamBlock p={p} limit={limit} bottom={p.panelTop - 1.5} />
      </>
    );
  },

  // The exporter strokes a ring 6.4% of the circle's size; match it here.
  headshot: (p) => {
    const c = colors(p);
    const w = (p.headshot?.size ?? 22) * 0.064;
    return { style: { border: `${p.u(w)} solid ${c.sub}` }, ring: c.sub };
  },

  panel: (p) => {
    const c = colors(p);
    const i = 1.2; // stitched border inset
    const t = 0.3; // stitch thickness
    const h = stitchRule(p, c.stitch, 90);
    const v = stitchRule(p, c.stitch, 180);
    const span = `calc(100% - ${p.u(2 * i)})`;
    return {
      background: [
        `${h} left ${p.u(i)} top ${p.u(i)} / ${span} ${p.u(t)} no-repeat`,
        `${h} left ${p.u(i)} bottom ${p.u(i)} / ${span} ${p.u(t)} no-repeat`,
        `${v} left ${p.u(i)} top ${p.u(i)} / ${p.u(t)} ${span} no-repeat`,
        `${v} right ${p.u(i)} top ${p.u(i)} / ${p.u(t)} ${span} no-repeat`,
        SHEEN,
        c.primary,
      ].join(", "),
      borderRadius: 0,
      color: c.ink,
      fontFamily: FONTS.sans,
      // em-based gaps in the layout scale with the card, not the page.
      fontSize: p.u(2.6),
      lineHeight: 1.25,
      ...shadow(p, DROP),
    };
  },

  name: (p) => {
    const c = colors(p);
    const ls = p.variant !== "duo" && p.landscape ? 0.03 : 0.04;
    const base: CSSProperties = {
      // The user's font when the name fits the panel row, else a narrower one.
      fontFamily: backNameFamily(p, { jerseyW: pennantW(p), letterSpacing: ls }),
      fontStyle: p.nameItalic ? "italic" : "normal",
      letterSpacing: `${ls}em`,
      color: c.ink,
    };
    return p.variant === "duo"
      ? { ...base, lineHeight: 1.05, textTransform: "uppercase" }
      : p.landscape
        ? { ...base, lineHeight: 1.02 }
        : { ...base, lineHeight: 1 };
  },

  jersey: (p, num) => <JerseyPennant p={p} num={num} />,

  // Ribbon tails: notched bottoms, stitched across the top.
  stat: (p, k, v) => {
    const c = colors(p);
    const notch = 1.3;
    return (
      <div
        style={{
          position: "relative",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          background: c.tab,
          color: c.tabInk,
          clipPath: `polygon(0 0, 100% 0, 100% 100%, 50% calc(100% - ${p.u(notch)}), 0 100%)`,
          padding: `${p.u(1.05)} ${p.u(0.6)} ${p.u(notch + 0.45)}`,
        }}
      >
        <Stitch p={p} color={c.tabStitch} at="top" y={0.5} left={0.6} right={0.6} thick={0.22} />
        <div style={caps(p.u(1.7), 0.2, { opacity: 0.72, marginRight: "-0.2em" })}>{k}</div>
        <div
          style={caps(p.u(v.length > 4 ? 3 : 3.8), 0.02, {
            lineHeight: 1.08,
            marginTop: p.u(0.2),
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
          })}
        >
          {v}
        </div>
      </div>
    );
  },

  label: (p, text) => {
    const c = colors(p);
    return (
      <div style={{ display: "flex", marginBottom: p.u(p.landscape ? 0.55 : 0.8) }}>
        <Ribbon p={p} bg={c.tab} stitch={null} notchL={1.1} notchR={1.1} padL={2.2} padR={2.2} padY={0.42}>
          <div style={caps(p.u(1.8), 0.24, { color: c.tabInk, marginRight: "-0.24em" })}>{text}</div>
        </Ribbon>
      </div>
    );
  },

  // Pull-quote between two stars, like the front's first-name line.
  quote: (p, text) => {
    const c = colors(p);
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: p.u(1.6) }}>
        <Star size={p.u(2)} color={c.accent} />
        <p
          style={{
            flex: "0 1 auto",
            minWidth: 0,
            margin: 0,
            textAlign: "center",
            fontSize: p.u(p.landscape ? 2.8 : 3),
            lineHeight: p.landscape ? 1.24 : 1.26,
            fontStyle: "italic",
            fontWeight: 600,
            color: c.ink,
          }}
        >
          &ldquo;{text}&rdquo;
        </p>
        <Star size={p.u(2)} color={c.accent} />
      </div>
    );
  },

  body: (p) => ({
    fontSize: p.u(p.landscape ? 2.7 : 2.8),
    lineHeight: p.landscape ? 1.27 : 1.34,
    fontWeight: 500,
    color: colors(p).ink,
    margin: 0,
  }),

  qa: (p, label, value) =>
    p.variant === "duo" ? (
      <div style={{ display: "flex", flexDirection: "column", gap: p.u(0.55), minWidth: 0 }}>
        <StarLabel p={p} text={label.toUpperCase()} size={2.3} ls={0.16} />
        <span style={{ fontSize: p.u(3.6), lineHeight: 1.18, fontWeight: 600, color: colors(p).ink }}>{value}</span>
      </div>
    ) : (
      <div style={{ minWidth: 0 }}>
        <StarLabel p={p} text={label} size={p.landscape ? 1.7 : 1.75} ls={0.14} />
        <div
          style={{
            fontSize: p.u(p.landscape ? 2.7 : 2.8),
            fontWeight: 600,
            lineHeight: 1.12,
            marginTop: p.u(0.1),
            color: colors(p).ink,
            overflowWrap: "anywhere",
          }}
        >
          {value}
        </div>
      </div>
    ),

  // A notched, stitched banner in the secondary color.
  match: (p, m) => {
    const c = colors(p);
    const duo = p.variant === "duo";
    const L = !duo && p.landscape;
    const notch = L ? 1.8 : 2.2;
    const pts = [
      "0 0",
      "100% 0",
      `calc(100% - ${p.u(notch)}) 50%`,
      "100% 100%",
      "0 100%",
      `${p.u(notch)} 50%`,
    ];
    return (
      <div
        style={{
          ...(duo ? { flex: "0 0 auto" } : {}),
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: p.u(L ? 1.6 : 2),
          background: c.tab,
          color: c.tabInk,
          clipPath: `polygon(${pts.join(", ")})`,
          padding: `${p.u(L ? 1.05 : 1.4)} ${p.u(notch + 1.6)}`,
        }}
      >
        <Stitch p={p} color={c.tabStitch} at="top" y={0.6} left={notch + 0.9} right={notch + 0.9} thick={0.26} />
        <Stitch p={p} color={c.tabStitch} at="bottom" y={0.6} left={notch + 0.9} right={notch + 0.9} thick={0.26} />
        {m.photos({
          width: duo ? p.u(10) : L ? "13%" : "13%",
          aspectRatio: "1 / 1",
          flexShrink: 0,
          borderRadius: "9999px",
          border: `${p.u(p.landscape ? 0.84 : 0.6)} solid ${c.primary}`,
        })}
        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
          <div
            style={caps(p.u(L ? 1.7 : 1.8), 0.24, {
              display: "flex",
              alignItems: "center",
              gap: "0.5em",
              opacity: 0.78,
              marginBottom: p.u(L ? 0.15 : 0.25),
            })}
          >
            <Star size="0.8em" color={c.tabInk} />
            {m.label}
            <Star size="0.8em" color={c.tabInk} />
          </div>
          <div
            style={
              duo
                ? caps(p.u(4), 0.04, { lineHeight: 1.05, whiteSpace: "normal" })
                : caps(p.u(L ? 3.8 : 4.6), 0.04, { lineHeight: 1.02, overflow: "hidden", textOverflow: "ellipsis" })
            }
          >
            {m.name}
          </div>
          {m.blurb && (
            <p
              style={{
                margin: `${p.u(L ? 0.2 : 0.35)} 0 0`,
                fontSize: p.u(L ? 2.2 : 2.4),
                lineHeight: 1.22,
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
  },

  matchRing: (p) => colors(p).primary,

  coach: (p, label, value) => {
    const c = colors(p);
    // Solo: shrink a long name list toward one line (half the panel in
    // portrait, the left column in landscape) before it wraps.
    const size =
      p.variant === "duo"
        ? 3
        : Math.max(2.5, fitSize(value, 3.1, p.landscape ? 41 : 38, FONT_EM.oswald, 0.03));
    return (
      <div style={{ minWidth: 0 }}>
        <StarLabel p={p} text={label} size={1.8} ls={0.18} />
        <div
          style={caps(p.u(size), 0.03, {
            whiteSpace: "normal",
            lineHeight: 1.08,
            marginTop: p.u(0.4),
            textTransform: "uppercase",
            color: c.ink,
          })}
        >
          {value}
        </div>
      </div>
    );
  },

  // A sewn rule above the coaching staff.
  divider: (p) => ({
    backgroundImage: stitchRule(p, colors(p).stitch, 90),
    backgroundSize: `100% ${p.u(0.3)}`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "left top",
    paddingTop: p.u(p.variant === "duo" ? 2 : p.landscape ? 1.5 : 1.6),
  }),
};
