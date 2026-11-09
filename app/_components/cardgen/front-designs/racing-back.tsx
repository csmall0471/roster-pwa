// Racing back — the Racing livery carried onto the card back. The same leaning
// shapes as the front (every edge leans forward 15°, text stays upright):
//   - header: the front's team block itself (team plate + speed stripes,
//     age · season strip), bleeding off the left trim;
//   - headshot: ringed in the strip color, two speed stripes off its right;
//   - panel: a dark surface tinted with a deep team color, its top-left and
//     bottom-right corners cut on the lean like a plate, two speed stripes
//     trailing in the bottom-right notch;
//   - number board: the front's board (secondary fill, primary keyline, a
//     leading stripe); stat chips, section and coach labels are leaning
//     plates and strips;
//   - player / duo match: a leaning primary plate with trailing stripes and a
//     keylined label tab on its top edge.
// Colors come from the team palette, swapped where a color would vanish into
// the panel (e.g. a navy primary on a navy panel uses the secondary instead).
//
// Plates with a variable height (match banner) lean with skewX so the angle is
// exact; fixed-height pieces are cut with clip-path.

import type { CSSProperties, ReactNode } from "react";
import { RacingTeam } from "./racing";
import {
  FONTS,
  SAFE,
  accentLift,
  fitSize,
  luminance,
  type BackTheme,
  type BackThemeProps,
  type CardUnit,
} from "./shared";

const RAD = Math.PI / 180;
const TAN = Math.tan(15 * RAD);
const SIN = Math.sin(15 * RAD);
const COS = Math.cos(15 * RAD);
const LEAN = "skewX(-15deg)";
const SHADOW = "drop-shadow(0 3px 6px rgba(0,0,0,0.45))";

// ── Colors ──────────────────────────────────────────────────────────────────

type Pair = { bg: string; fg: string };

type Look = {
  panel: string; // panel surface (hex)
  hero: Pair; // big plates: match banner
  strip: Pair; // small strips: labels, chip ticks, ring
  accent: string; // small colored text on the panel
  stripeA: string; // speed stripes on the panel (secondary, then primary)
  stripeB: string;
  key: string; // number-board keyline
  board: Pair; // number-board fill
};

const CARBON = "#15161a";
const PANEL_L = 0.014; // target luminance of a tinted panel
const WHITE: Pair = { bg: "#ffffff", fg: "#0a0a0a" };

function rgbOf(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [10, 10, 10];
  let h = m[1];
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const A = rgbOf(a);
  const B = rgbOf(b);
  return (
    "#" +
    A.map((v, i) =>
      Math.round(v + (B[i] - v) * t)
        .toString(16)
        .padStart(2, "0")
    ).join("")
  );
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = rgbOf(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function ratio(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// The panel takes the darker team color, deepened until white text has ~15:1
// contrast. Black takes the other color when that is deep too (navy, maroon,
// purple …); otherwise black, or two light colors, give a neutral carbon.
function panelColor(bgs: string[]): string {
  const [darkest, other] = [...bgs].sort((x, y) => luminance(x) - luminance(y));
  const black = (c: string) => luminance(c) < 0.008;
  const tint = black(darkest) && !black(other) && luminance(other) < 0.1 ? other : darkest;
  const L = luminance(tint);
  if (L > 0.3 || black(tint)) return CARBON;
  if (L <= PANEL_L) return tint;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (luminance(mix(tint, "#000000", mid)) > PANEL_L) lo = mid;
    else hi = mid;
  }
  return mix(tint, "#000000", hi);
}

const looks = new Map<string, Look>();

function look(p: BackThemeProps): Look {
  const { background, color, subBackground, subColor } = p.palette;
  const key = [background, color, subBackground, subColor].join("|");
  const hit = looks.get(key);
  if (hit) return hit;
  const P: Pair = { bg: background, fg: color };
  const S: Pair = { bg: subBackground, fg: subColor };
  const panel = panelColor([P.bg, S.bg]);
  const vis = (c: string) => ratio(c, panel) >= 1.9;
  const strip = vis(S.bg) ? S : vis(P.bg) ? P : WHITE;
  const out: Look = {
    panel,
    hero: vis(P.bg) ? P : strip,
    strip,
    accent: [S.bg, P.bg].find((c) => ratio(c, panel) >= 4.5) ?? "#ffffff",
    stripeA: vis(S.bg) ? S.bg : "#ffffff",
    stripeB: vis(P.bg) ? P.bg : "#ffffff",
    key: P.bg,
    board: S,
  };
  if (looks.size > 64) looks.clear();
  looks.set(key, out);
  return out;
}

// ── Pieces ──────────────────────────────────────────────────────────────────

// clip-path for a box leaning forward with a run of `s` u over its height.
function lean(u: CardUnit, s: number): string {
  return `polygon(${u(s)} 0, 100% 0, calc(100% - ${u(s)}) 100%, 0 100%)`;
}

// A leaning strip with text (section labels, coach labels).
function Strip({ p, text, h, size, pair }: { p: BackThemeProps; text: string; h: number; size: number; pair: Pair }) {
  const { u } = p;
  const s = h * TAN;
  const ls = 0.2;
  return (
    <div style={{ display: "flex" }}>
      <div
        style={{
          flex: "none",
          boxSizing: "border-box",
          height: u(h),
          // Trailing letter-spacing sits inside the right padding.
          padding: `0 ${u(s + 0.9 - size * ls)} 0 ${u(s + 0.9)}`,
          clipPath: lean(u, s),
          background: pair.bg,
          color: pair.fg,
          display: "flex",
          alignItems: "center",
          fontSize: u(size),
          fontWeight: 800,
          letterSpacing: `${ls}em`,
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
    </div>
  );
}

// Two speed stripes (secondary, primary) of height h: widths t1, t2 with gaps
// measured sideways like the front's trailing stripes.
function Stripes({
  p,
  h,
  t1,
  t2,
  gap,
  style,
}: {
  p: BackThemeProps;
  h: number;
  t1: number;
  t2: number;
  gap: number;
  style?: CSSProperties;
}) {
  const { u } = p;
  const k = look(p);
  const s = h * TAN;
  return (
    <div style={{ display: "flex", flex: "none", ...style }}>
      <div style={{ flex: "none", height: u(h), width: u(t1 + s), background: k.stripeA, clipPath: lean(u, s) }} />
      <div
        style={{
          flex: "none",
          height: u(h),
          width: u(t2 + s),
          marginLeft: u(gap - s),
          background: k.stripeB,
          clipPath: lean(u, s),
        }}
      />
    </div>
  );
}

// Small leaning tick in the strip color (before Q&A labels).
function Tick({ p, h }: { p: BackThemeProps; h: number }) {
  const { u } = p;
  const s = h * TAN;
  return (
    <div
      style={{ flex: "none", height: u(h), width: u(0.9 + s), background: look(p).strip.bg, clipPath: lean(u, s) }}
    />
  );
}

// The front's number board: secondary fill inside a primary keyline, with a
// leading stripe. The number is in normal flow so the board baseline-aligns
// with the player name.
function Board({ p, num }: { p: BackThemeProps; num: string }) {
  const { u } = p;
  const k = look(p);
  const h = p.landscape ? 6.4 : 7;
  const s = h * TAN;
  const size = fitSize(num, h * 0.72, 8.5, 0.5);
  const w = Math.max(h * 1.5, [...num].length * 0.5 * size + 2 * s + 2.4);
  const d = 0.55; // keyline
  const kx = d / COS; // keyline measured sideways on the slanted ends
  const lead = 1.1;
  const gap = 0.75;
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flex: "none",
        marginLeft: u(lead + gap),
        ...(p.compact ? {} : { filter: SHADOW }),
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          right: u(w - s + gap),
          height: u(h),
          width: u(lead + s),
          background: k.stripeB,
          clipPath: lean(u, s),
        }}
      />
      <div
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          height: u(h),
          width: u(w),
          background: k.key,
          clipPath: lean(u, s),
        }}
      >
        <div
          style={{
            flex: "none",
            marginLeft: u(TAN * d + kx),
            height: u(h - 2 * d),
            width: u(w - 2 * TAN * d - 2 * kx),
            background: k.board.bg,
            color: k.board.fg,
            clipPath: lean(u, (h - 2 * d) * TAN),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: FONTS.anton,
            fontSize: u(size),
            lineHeight: 1,
            letterSpacing: "0.02em",
            whiteSpace: "nowrap",
          }}
        >
          {num}
        </div>
      </div>
    </div>
  );
}

// A label tab like the number board: `fill` inside a `keyline`, text in
// the keyline color, so it reads half on the panel and half on a plate.
function KeyTab({
  p,
  text,
  h,
  size,
  keyline,
  fill,
}: {
  p: BackThemeProps;
  text: string;
  h: number;
  size: number;
  keyline: string;
  fill: string;
}) {
  const { u } = p;
  const d = 0.35;
  const kx = d / COS;
  const si = (h - 2 * d) * TAN;
  const ls = 0.2;
  return (
    <div
      style={{
        display: "flex",
        boxSizing: "border-box",
        height: u(h),
        padding: `${u(d)} ${u(TAN * d + kx)}`,
        background: keyline,
        clipPath: lean(u, h * TAN),
      }}
    >
      <div
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          padding: `0 ${u(si + 0.7 - size * ls)} 0 ${u(si + 0.7)}`,
          background: fill,
          color: keyline,
          clipPath: lean(u, si),
          fontSize: u(size),
          fontWeight: 800,
          letterSpacing: `${ls}em`,
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
    </div>
  );
}

// Two speed stripes off the headshot's right side (on the card background, so
// in the front's stripe colors), sized to stay 2.5u inside the right trim.
function HeadshotStripes({ p }: { p: BackThemeProps }) {
  const hs = p.headshot;
  if (!hs) return null;
  const r = hs.size / 2;
  const h = hs.size * (p.landscape ? 0.4 : 0.5);
  const s = h * TAN;
  // Left edge of the first stripe at mid-height, 1u off the circle.
  const x0 = hs.left + hs.size + 1;
  const room = p.W - 2.5 - (x0 + s / 2);
  const f = Math.min(1, room / 2.95);
  if (f < 0.6) return null;
  const stripe = (i: number) =>
    p.colorSource === "default" ? p.textColor : i === 0 ? p.palette.subBackground : p.palette.background;
  const { u } = p;
  return (
    <div
      style={{
        position: "absolute",
        top: u(hs.top + r - h / 2),
        left: u(x0 - s / 2),
        display: "flex",
        pointerEvents: "none",
        ...(p.compact ? {} : { filter: SHADOW }),
      }}
    >
      <div style={{ flex: "none", height: u(h), width: u(1.4 * f + s), background: stripe(0), clipPath: lean(u, s) }} />
      <div
        style={{
          flex: "none",
          height: u(h),
          width: u(0.85 * f + s),
          marginLeft: u(0.7 * f - s),
          background: stripe(1),
          clipPath: lean(u, s),
        }}
      />
    </div>
  );
}

// ── Theme ───────────────────────────────────────────────────────────────────

const MUTED = "rgba(255,255,255,0.58)";

export const racingBack: BackTheme = {
  header: (p) => (
    <>
      <HeadshotStripes p={p} />
      <RacingTeam
        p={{ ...p, jersey: "" }}
        right={p.headshot ? p.headshot.left - 3 : p.W - SAFE}
        maxBottom={p.panelTop - 1.5}
      />
    </>
  ),

  headshot: (p) => {
    const k = look(p);
    const size = p.headshot?.size ?? 22;
    return {
      style: {
        // Same width the exporter strokes (6.4% of the circle) so the preview
        // matches the export.
        border: `${p.u(size * 0.064)} solid ${k.strip.bg}`,
        boxSizing: "border-box",
        filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.45))",
      },
      ring: k.strip.bg,
    };
  },

  panel: (p) => {
    const { u } = p;
    const k = look(p);
    // Corners cut on the lean (run c over a height of c / tan 15°): a small
    // cut top-left, a bigger one bottom-right with two speed stripes trailing
    // in the notch, like a front plate's tail. Both stay inside the padding.
    const c1 = 2.6;
    const c2 = 4.2;
    const [g1, t1, g2, t2] = [0.55, 1.15, 0.5, 0.75];
    const R = (x: number) => `calc(100% - ${u(x)})`; // x u in from the right / bottom
    const up = (x: number) => R(x / TAN); // height where a lean line x u from the corner meets the right edge
    const a = c2 - g1; // stripe 1 left edge, measured in from the corner along the bottom
    const b = a - t1;
    const c = b - g2;
    const e = c - t2;
    const pts = [
      `${u(c1)} 0`,
      "100% 0",
      `100% ${up(c2)}`,
      `${R(c2)} 100%`,
      `${R(a)} 100%`,
      `100% ${up(a)}`,
      `100% ${up(b)}`,
      `${R(b)} 100%`,
      `${R(c)} 100%`,
      `100% ${up(c)}`,
      `100% ${up(e)}`,
      `${R(e)} 100%`,
      "0 100%",
      `0 ${u(c1 / TAN)}`,
    ];
    // Stripe colors: a 105° gradient over the whole box; a lean line through
    // the bottom edge x u in from the right sits x·cos15° before its end.
    const at = (x: number) => R(x * COS);
    const stripes =
      `linear-gradient(105deg, transparent ${at(a)}, ${k.stripeA} ${at(a)} ${at(b)}, ` +
      `transparent ${at(b)} ${at(c)}, ${k.stripeB} ${at(c)})`;
    const surface = `linear-gradient(165deg, ${rgba(mix(k.panel, "#ffffff", 0.07), 0.95)} 0%, ${rgba(k.panel, 0.95)} 45%)`;
    return {
      background: `${stripes}, ${surface}`,
      clipPath: `polygon(${pts.join(", ")})`,
      color: "#fff",
      fontFamily: FONTS.sans,
      // Base size for the layout's em gaps, so they scale with the card (a
      // bit tighter in the wide back's short columns).
      fontSize: u(p.landscape && p.variant === "solo" ? 2.4 : 2.8),
    };
  },

  name: (p) => ({
    fontFamily: p.nameFont.family,
    fontStyle: p.nameItalic ? "italic" : "normal",
    letterSpacing: "0.03em",
    lineHeight: p.variant === "duo" ? 1.05 : p.landscape ? 1.02 : 1,
    color: "#fff",
    // The solo name clips (overflow hidden at line-height 1): leave room for
    // accents over capitals (JOSÉ NÚÑEZ).
    ...(p.variant === "duo"
      ? { textTransform: "uppercase" as const }
      : accentLift(p.nameLines.join(" "), 1)
        ? { paddingTop: "0.24em" }
        : {}),
  }),

  jersey: (p, num) => <Board p={p} num={num} />,

  stat: (p, label, value) => {
    const { u } = p;
    const k = look(p);
    const h = p.landscape ? 7.2 : 7.4;
    const s = h * TAN;
    // Strip-colored lead band, its right edge on the same lean as the chip.
    const t = h * SIN + 0.75 * COS;
    return (
      <div
        style={{
          boxSizing: "border-box",
          height: u(h),
          minWidth: 0,
          padding: `0 ${u(s + 0.3)}`,
          clipPath: lean(u, s),
          background: `linear-gradient(105deg, ${k.strip.bg} 0 ${u(t)}, transparent ${u(t)}), rgba(255,255,255,0.13)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: u(0.5),
        }}
      >
        <div style={{ fontSize: u(1.55), letterSpacing: "0.16em", color: MUTED, fontWeight: 700, lineHeight: 1 }}>
          {label}
        </div>
        <div
          style={{
            fontFamily: FONTS.anton,
            fontSize: u(value.length > 4 ? 3 : 3.8),
            lineHeight: 1,
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {value}
        </div>
      </div>
    );
  },

  label: (p, text) => (
    <div style={{ marginBottom: p.u(p.landscape ? 0.5 : 0.6) }}>
      <Strip p={p} text={text} h={p.landscape ? 2.6 : 2.8} size={p.landscape ? 1.55 : 1.65} pair={look(p).strip} />
    </div>
  ),

  quote: (p, text) => {
    const size = p.landscape ? 2.7 : 3;
    const lh = p.landscape ? 1.25 : 1.3;
    const h = size * 0.95;
    return (
      <div style={{ display: "flex", alignItems: "flex-start", gap: p.u(1.3) }}>
        <Stripes p={p} h={h} t1={1.1} t2={0.65} gap={0.55} style={{ marginTop: p.u((size * lh - h) / 2) }} />
        <p
          style={{
            margin: 0,
            minWidth: 0,
            fontSize: p.u(size),
            lineHeight: lh,
            fontStyle: "italic",
            fontWeight: 600,
            color: "#fff",
          }}
        >
          &ldquo;{text}&rdquo;
        </p>
      </div>
    );
  },

  body: (p) => ({
    fontSize: p.u(p.landscape ? 2.65 : 2.8),
    lineHeight: p.landscape ? 1.27 : 1.35,
    fontStyle: "italic",
    color: "rgba(255,255,255,0.9)",
    margin: 0,
  }),

  qa: (p, label, value) => {
    const { u } = p;
    if (p.variant === "duo") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: u(0.5) }}>
          <div style={{ display: "flex", alignItems: "center", gap: u(0.8) }}>
            <Tick p={p} h={2.1} />
            <span
              style={{
                fontSize: u(2.3),
                letterSpacing: "0.14em",
                fontWeight: 800,
                textTransform: "uppercase",
                color: look(p).accent,
                lineHeight: 1,
              }}
            >
              {label}
            </span>
          </div>
          <span style={{ fontSize: u(3.6), lineHeight: 1.18, color: "#fff" }}>{value}</span>
        </div>
      );
    }
    return (
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: u(0.7), marginBottom: u(p.landscape ? 0.22 : 0.3) }}>
          <Tick p={p} h={1.55} />
          <span style={{ fontSize: u(1.7), letterSpacing: "0.12em", color: MUTED, fontWeight: 700, lineHeight: 1 }}>
            {label}
          </span>
        </div>
        <div
          style={{
            fontSize: u(p.landscape ? 2.65 : 2.75),
            fontWeight: 600,
            color: "#fff",
            lineHeight: p.landscape ? 1.1 : 1.14,
            overflowWrap: "anywhere",
          }}
        >
          {value}
        </div>
      </div>
    );
  },

  match: (p, m) => {
    const { u } = p;
    const k = look(p);
    const duo = p.variant === "duo";
    const L = !duo && p.landscape;
    // K keeps the skewed plate's corners inside the box (overhang = h·tan/2).
    const K = L ? 2.1 : 2.6;
    const [g1, t1, g2, t2] = L ? [0.8, 1.8, 0.7, 1.1] : [1, 2.2, 0.8, 1.3];
    const tail = g1 + t1 + g2 + t2;
    // The label rides the plate's top edge as a keylined tab, its top half in
    // the gap above the banner.
    const tight = L || (duo && p.landscape);
    const tabH = tight ? 2.3 : 2.5;
    const padY = L ? 1 : 1.3;
    const padL = K + 1.8;
    const layer = (style: CSSProperties): ReactNode => (
      <div style={{ position: "absolute", top: 0, bottom: 0, zIndex: -1, transform: LEAN, ...style }} />
    );
    const ring = rgba(k.hero.fg, 0.85);
    return (
      <div
        style={{
          // The group back's gaps are tighter; keep the tab clear of the coaches.
          ...(duo ? { flex: "0 0 auto", marginTop: u(p.landscape ? 0.9 : 0.4) } : {}),
          position: "relative",
          zIndex: 0,
          display: "flex",
          alignItems: "center",
          gap: u(L ? 2 : 2.4),
          padding: `${u(tabH / 2 + (L ? 0.55 : 0.75))} ${u(K + tail + 2.4)} ${u(padY)} ${u(padL)}`,
          color: k.hero.fg,
        }}
      >
        {layer({ left: u(K), right: u(K + tail), background: k.hero.bg })}
        {layer({ right: u(K + t2 + g2), width: u(t1), background: k.stripeA })}
        {layer({ right: u(K), width: u(t2), background: k.stripeB })}
        <div style={{ position: "absolute", top: u(-tabH / 2), left: u(padL) }}>
          <KeyTab p={p} text={m.label} h={tabH} size={tight ? 1.35 : 1.45} keyline={k.hero.bg} fill={k.hero.fg} />
        </div>
        {m.photos({
          width: duo ? u(10) : L ? "12.5%" : "13%",
          aspectRatio: "1 / 1",
          flexShrink: 0,
          borderRadius: "9999px",
          boxSizing: "border-box",
          border: `${u(0.006 * p.W)} solid ${ring}`,
        })}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: FONTS.anton,
              fontSize: u(duo ? 4.2 : L ? 4.3 : 5),
              lineHeight: 1,
              letterSpacing: "0.03em",
              ...(duo ? {} : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }),
            }}
          >
            {m.name}
          </div>
          {m.blurb && (
            <p
              style={{
                margin: `${u(L ? 0.35 : 0.5)} 0 0`,
                fontSize: u(L ? 2.2 : 2.4),
                lineHeight: 1.2,
                fontWeight: 600,
                fontStyle: "italic",
                color: rgba(k.hero.fg, 0.85),
              }}
            >
              {m.blurb}
            </p>
          )}
        </div>
      </div>
    );
  },

  matchRing: (p) => rgba(look(p).hero.fg, 0.85),

  coach: (p, label, value) => (
    <div style={{ minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: p.u(0.5) }}>
      <Strip p={p} text={label} h={2.4} size={1.45} pair={look(p).strip} />
      <div
        style={{
          alignSelf: "stretch",
          fontFamily: FONTS.anton,
          fontSize: p.u(p.variant === "duo" ? 3.2 : 3.4),
          lineHeight: 1.05,
          letterSpacing: "0.02em",
          color: "#fff",
        }}
      >
        {value}
      </div>
    </div>
  ),

  divider: (p) => ({
    borderTop: "1px solid rgba(255,255,255,0.16)",
    // A short strip-colored lead on the rule.
    backgroundImage: `linear-gradient(${look(p).strip.bg}, ${look(p).strip.bg})`,
    backgroundSize: `${p.u(7)} ${p.u(0.45)}`,
    backgroundPosition: "0 0",
    backgroundRepeat: "no-repeat",
    paddingTop: p.variant === "duo" ? p.u(2.2) : p.u(1.3),
  }),
};
