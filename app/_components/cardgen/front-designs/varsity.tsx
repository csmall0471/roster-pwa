// Varsity — collegiate letterman / chenille-patch lettering. No plates: every
// big piece is a chunky letter with a secondary-color felt ring, a thin
// contrasting edge and a stepped 3D drop, all built from text-shadow layers
// (exports on iOS, and scales with the card because every offset is in em).
//
//   top-left   team name in Bungee 3D letters, a felt stripe, AGE · SEASON
//   top-right  a big 3D varsity number with a small raised "#"
//   bottom     first name (smaller) over LAST NAME in the user's name font
//   below      the same felt stripe and the coach lines in Oswald caps
//
// Every line box is exactly its font's cap height (CapLine), and every width
// is measured from per-character advance tables, so the layout is computed in
// u up front: nothing depends on the page's line-height strut, and long team
// names / names shrink before they reach the jersey or the edge.

import type { CSSProperties, ReactNode } from "react";
import {
  accentLift,
  FONTS,
  FONT_EM,
  SAFE,
  abs,
  coachLines,
  contrastText,
  fitSize,
  luminance,
  shadow,
  subLine,
  teamOrPlaceholder,
  type FontKey,
  type FrontDesign,
  type FrontDesignProps,
} from "./shared";

// ── Font metrics ─────────────────────────────────────────────────────────────

type MeasuredFont = Exclude<FontKey, "sans">;
type Cap = { top: number; h: number };

// At line-height 1: distance from the top of the line box to the cap top, and
// the cap height, in em (measured from the loaded fonts).
const CAP: Record<MeasuredFont, Cap> = {
  anton: { top: 0.058, h: 0.867 },
  bebas: { top: 0.09, h: 0.71 },
  archivo: { top: 0.135, h: 0.7 },
  stencil: { top: 0.137, h: 0.648 },
  bungee: { top: 0.125, h: 0.735 },
  oswald: { top: 0.129, h: 0.821 },
  marker: { top: 0.15, h: 0.745 },
};
const CAP_FALLBACK: Cap = { top: 0.1, h: 0.75 };

// Advance widths in 1/1000 em, three digits per character of CHARS (measured
// from the loaded fonts; Oswald at 700).
const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ &.'-,0123456789";
const ADVANCES: Record<MeasuredFont, string> = {
  anton: "485479474493412399485499227466472397746498486472494477461396474469712484446410234520229214311236494331494494494494494494494494",
  bebas: "401404383406363344391420192265414344538427400386400403372364402382557406394362160417188188270188400400400400400400400400400400",
  archivo: "778778778778722667833833389667833667944833833722833778722722833778999778778722333889333278333333667667667667667667667667667667",
  stencil: "732730703726691649730740440668669622902736714713711726721613729669941655633621259813359377613359732570715730680731732634752732",
  bungee: "730725628746654618708759605688746695849753737682737743650656746730831737705660225766384356420384727601639637709647693627711693",
  oswald: "551588563586447434582610301349567443704561586571586600514445588526697515493433256570244170324238550385514514524509538439521538",
  marker: "702687611589627575789695516669776633974685744640744646576607695584994623493664370600229266609204687322650562582580501576537529",
};
const ADV = new Map<MeasuredFont, Map<string, number>>(
  (Object.keys(ADVANCES) as MeasuredFont[]).map((k) => [
    k,
    new Map([...CHARS].map((ch, i) => [ch, Number(ADVANCES[k].slice(i * 3, i * 3 + 3)) / 1000])),
  ])
);
const HASH_W = 0.75; // Bungee "#"

// CSS variable → font, to measure the user's name font.
const FONT_VARS: Array<[string, MeasuredFont]> = [
  ["--font-anton", "anton"],
  ["--font-bebas", "bebas"],
  ["--font-archivo-black", "archivo"],
  ["--font-black-ops", "stencil"],
  ["--font-bungee", "bungee"],
  ["--font-oswald", "oswald"],
  ["--font-marker", "marker"],
];
function fontOf(family: string): MeasuredFont | null {
  return FONT_VARS.find(([v]) => family.includes(v))?.[1] ?? null;
}

// Width of `text` in em. Characters that were not measured (accents, symbols)
// count as 10% wider than the font's average uppercase advance.
function textEm(font: MeasuredFont | null, text: string, avg: number) {
  const t = font ? ADV.get(font) : undefined;
  let w = 0;
  for (const ch of text) w += t?.get(ch) ?? avg * 1.1;
  return w;
}

// fitSize with the text's measured width, plus `extra` em of lettering that
// sits outside the advance (outline, 3D drop, italic lean).
function fitText(text: string, font: MeasuredFont | null, avg: number, base: number, avail: number, ls: number, extra: number) {
  const n = Math.max(1, [...text].length);
  return fitSize(text, base, avail, (textEm(font, text, avg) + extra) / n, ls);
}

// ── Inks ─────────────────────────────────────────────────────────────────────

type Ink = { fill: string; ring: string; edge: string; depth: string };

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// Mix toward black (amt 0…1).
function shade(hex: string, amt: number) {
  const c = rgb(hex);
  if (!c) return "#000000";
  return `#${c.map((v) => Math.round(v * (1 - amt)).toString(16).padStart(2, "0")).join("")}`;
}
function contrast(a: string, b: string) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// fill = the letter (primary), ring = the felt border (secondary), edge = a
// hairline that contrasts with the ring (so one of the two always reads
// against the photo), depth = the 3D drop (the ring color, shaded). With no
// colors picked: white letters, near-black ring and drop — legible on dark and
// light backgrounds alike.
function inks(p: FrontDesignProps): Ink {
  if (p.colorSource === "default") return { fill: "#ffffff", ring: "#0a0a0a", edge: "#ffffff", depth: "#000000" };
  const fill = p.palette.background;
  // Same (or nearly the same) two colors: ring in the fill's readable contrast.
  const ring = contrast(fill, p.palette.subBackground) < 1.3 ? p.palette.color : p.palette.subBackground;
  return { fill, ring, edge: contrastText(ring), depth: shade(ring, 0.45) };
}

// Small text (age · season, coaches) is too fine to carry the felt outline, so
// it is one solid color with a thin contrasting outline: the secondary, else
// the primary — whichever reads against the card's light/dark background —
// else the scheme's title color. With no colors picked it follows the scheme.
function smallInk(p: FrontDesignProps, k: Ink) {
  let color = p.textColor;
  if (p.colorSource !== "default") {
    const bg = luminance(p.textColor) > 0.5 ? "#1a1a1a" : "#eef2f7";
    const cands = [k.ring, k.fill].map((c) => ({ c, r: contrast(c, bg) }));
    const pick = cands.find((x) => x.r >= 4) ?? (cands[0].r >= cands[1].r ? cands[0] : cands[1]);
    if (pick.r >= 2.5) color = pick.c;
  }
  return { color, line: contrastText(color) };
}

// ── Text-shadow builders (em offsets) ────────────────────────────────────────

const R1 = 0.05; // felt ring
const R2 = 0.085; // outer hairline edge
const DEPTH = 0.09; // 3D drop, per axis
const STEPS = 4;
// How far the lettering reaches past the advance box, in em: left/top
// (outline, less ~0.02em of side bearing) and right/bottom (outline + drop).
const EXT_LT = R2 - 0.02;
const EXT_RB = DEPTH + R2 - 0.02;
const EXT_BELOW = DEPTH + R2; // below the baseline (no bearing)
// Small text: outline radius, and its reach right/below (outline + drop).
const SR = 0.06;
const S_EXT = 0.16;

const DIRS: Array<[number, number]> = [
  [1, 0], [0.707, 0.707], [0, 1], [-0.707, 0.707], [-1, 0], [-0.707, -0.707], [0, -1], [0.707, -0.707],
];
const em = (n: number) => `${+n.toFixed(3)}em`;
const layer = (x: number, y: number, c: string) => `${em(x)} ${em(y)} 0 ${c}`;
const ringLayers = (r: number, c: string) => DIRS.map(([x, y]) => layer(x * r, y * r, c));

// Fill → ring → edge → stepped 3D drop. The drop copies are widened sideways
// by the edge radius so the extrusion is as thick as the outlined letter.
function letterShadow(k: Ink) {
  const out = [...ringLayers(R1, k.ring), ...ringLayers(R2, k.edge)];
  const s = 0.707 * R2;
  for (let i = 1; i <= STEPS; i++) {
    const d = (DEPTH * i) / STEPS;
    out.push(layer(d, d, k.depth), layer(d + s, d - s, k.depth), layer(d - s, d + s, k.depth));
  }
  out.push(layer(DEPTH + R2, DEPTH, k.depth), layer(DEPTH, DEPTH + R2, k.depth), layer(DEPTH + s, DEPTH + s, k.depth));
  return out.join(", ");
}

function smallShadow(line: string) {
  return [...ringLayers(SR, line), layer(0.08, 0.1, line)].join(", ");
}

// ── Layout (all in u) ────────────────────────────────────────────────────────

const HASH = 0.4; // "#" size relative to the number
const HASH_GAP = 0.05; // em of the number
// Felt stripe (ring / fill / ring) under the team name and the player name.
const STRIPE_BAND = 0.28;
const STRIPE_CORE = 0.5;
const STRIPE_H = 2 * STRIPE_BAND + STRIPE_CORE;
const TEAM_LS = 0.02;
const SUB_LS = 0.3;
const NAME_LS = 0.01;
const COACH_LS = 0.14;
const STAMP_W = 27; // the LIMITED EDITION stamp, ≈ 26u wide

type Layout = ReturnType<typeof layout>;

function layout(p: FrontDesignProps) {
  const framed = !!p.frame;
  const L = p.landscape;
  // Outer limit for any lettering (outline and drop included): inside the
  // print-safe line, or clear of the frame's keyline.
  const m = framed ? p.inset + 1.5 : SAFE + 0.5;
  const gt = framed ? p.inset + 2 : L ? 5.5 : 6.5; // top of the top row's outline

  // Jersey number, its 3D drop ending at W − m.
  let jersey: { text: string; size: number; capTop: number; left: number; bottom: number } | null = null;
  if (p.jersey) {
    const text = p.jersey.toUpperCase();
    const extra = HASH * (EXT_LT + HASH_W) + HASH_GAP + EXT_RB;
    const size = fitText(text, "bungee", FONT_EM.bungee, L ? 14 : 16.5, L ? 34 : 30, 0, extra);
    const capTop = gt + R2 * size;
    jersey = {
      text,
      size,
      capTop,
      left: p.W - m - (textEm("bungee", text, FONT_EM.bungee) + extra) * size,
      bottom: capTop + CAP.bungee.h * size + EXT_BELOW * size,
    };
  }

  // Team block: from m to `right` (3u clear of the jersey, or the far edge).
  const left = m;
  const right = jersey ? jersey.left - 3 : p.W - m;
  const teamText = teamOrPlaceholder(p).toUpperCase();
  const teamSize = fitText(teamText, "bungee", FONT_EM.bungee, L ? 7.5 : 9, right - left, TEAM_LS, EXT_LT + EXT_RB);
  const teamCapTop = gt + R2 * teamSize;
  const teamCapBottom = teamCapTop + CAP.bungee.h * teamSize;
  const sub = subLine(p).toUpperCase();
  const subSize = sub ? fitText(sub, "oswald", FONT_EM.oswald, L ? 2.8 : 3, right - left, SUB_LS, SR + S_EXT) : 0;
  // Team → felt stripe (clear of the 3D drop) → age · season.
  const stripeTop = EXT_BELOW * teamSize + 0.9;
  const subGap = stripeTop + STRIPE_H + 1.2;
  const teamBottom = sub
    ? teamCapBottom + subGap + (CAP.oswald.h + S_EXT) * subSize
    : teamCapBottom + EXT_BELOW * teamSize;

  return { m, jersey, left, right, teamText, teamSize, teamCapTop, sub, subSize, stripeTop, teamBottom };
}

// ── Pieces ───────────────────────────────────────────────────────────────────

// One nowrap line whose box is exactly its cap height (box top = cap top), so
// stacks are computed from font metrics, not from the line-height strut.
function CapLine({
  family,
  size,
  u,
  cap,
  style,
  children,
}: {
  family: string;
  size: number;
  u: FrontDesignProps["u"];
  cap: Cap;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "none", height: `${cap.h}em`, fontSize: u(size), fontFamily: family }}>
      <div style={{ flex: "none", lineHeight: 1, marginTop: `${-cap.top}em`, whiteSpace: "nowrap", ...style }}>{children}</div>
    </div>
  );
}

// Stretches to the width of its flex column.
function Stripe({ p, k, mt, mb }: { p: FrontDesignProps; k: Ink; mt: number; mb: number }) {
  return (
    <div
      style={{
        alignSelf: "stretch",
        flex: "none",
        boxSizing: "content-box",
        height: p.u(STRIPE_CORE),
        background: k.fill,
        borderTop: `${p.u(STRIPE_BAND)} solid ${k.ring}`,
        borderBottom: `${p.u(STRIPE_BAND)} solid ${k.ring}`,
        marginTop: p.u(mt),
        marginBottom: p.u(mb),
      }}
    />
  );
}

function SmallLine({ p, text, size, ls, ink }: { p: FrontDesignProps; text: string; size: number; ls: number; ink: { color: string; line: string } }) {
  return (
    <div style={{ display: "flex", flex: "none" }}>
      <CapLine
        family={FONTS.oswald}
        size={size}
        u={p.u}
        cap={CAP.oswald}
        style={{ color: ink.color, fontWeight: 700, letterSpacing: em(ls), marginLeft: em(SR), textShadow: smallShadow(ink.line) }}
      >
        {text}
      </CapLine>
    </div>
  );
}

function Team({ p, Lo, k }: { p: FrontDesignProps; Lo: Layout; k: Ink }) {
  return (
    <div
      style={abs({
        left: p.u(Lo.left),
        top: p.u(Lo.teamCapTop),
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        ...shadow(p, "drop-shadow(0 2px 4px rgba(0,0,0,0.35))"),
      })}
    >
      <CapLine
        family={FONTS.bungee}
        size={Lo.teamSize}
        u={p.u}
        cap={CAP.bungee}
        style={{ color: k.fill, letterSpacing: em(TEAM_LS), marginLeft: em(EXT_LT), textShadow: letterShadow(k) }}
      >
        {Lo.teamText}
      </CapLine>
      {Lo.sub && (
        <>
          <Stripe p={p} k={k} mt={Lo.stripeTop} mb={1.2} />
          <SmallLine p={p} text={Lo.sub} size={Lo.subSize} ls={SUB_LS} ink={smallInk(p, k)} />
        </>
      )}
    </div>
  );
}

function Jersey({ p, Lo, k }: { p: FrontDesignProps; Lo: Layout; k: Ink }) {
  const j = Lo.jersey;
  if (!j) return null;
  const ts = letterShadow(k);
  return (
    <div
      style={abs({
        left: p.u(j.left),
        top: p.u(j.capTop),
        display: "flex",
        alignItems: "flex-start",
        ...shadow(p, "drop-shadow(0 3px 5px rgba(0,0,0,0.35))"),
      })}
    >
      {/* small raised "#", cap-top aligned with the number */}
      <CapLine
        family={FONTS.bungee}
        size={j.size * HASH}
        u={p.u}
        cap={CAP.bungee}
        style={{ color: k.fill, marginLeft: em(EXT_LT), textShadow: ts }}
      >
        #
      </CapLine>
      <div style={{ width: p.u(j.size * HASH_GAP), flex: "none" }} />
      <CapLine family={FONTS.bungee} size={j.size} u={p.u} cap={CAP.bungee} style={{ color: k.fill, textShadow: ts }}>
        {j.text}
      </CapLine>
    </div>
  );
}

function Bottom({ p, Lo, k }: { p: FrontDesignProps; Lo: Layout; k: Ink }) {
  const L = p.landscape;
  const font = fontOf(p.nameFont.family);
  const cap = font ? CAP[font] : CAP_FALLBACK;
  // Synthesized italic leans the cap tops right by ≈ ¼ of the cap height.
  const lean = p.nameItalic ? 0.25 * cap.h + 0.02 : 0;
  const avail = p.W - 2 * Lo.m;
  const fit = (text: string, base: number) => fitText(text, font, p.nameFont.em, base, avail, NAME_LS, EXT_LT + EXT_RB + lean);

  // Name lines, top to bottom, as [text, size].
  const lines: Array<[string, number]> = [];
  if (p.isGroup) {
    const t = (p.nameLines[0] ?? "").toUpperCase();
    if (t) lines.push([t, fit(t, 9 * p.nameSize)]);
  } else {
    const a = (p.nameLines[0] ?? "").toUpperCase();
    const b = (p.nameLines[1] ?? "").toUpperCase();
    const big = (L ? 11.5 : 13) * p.nameSize;
    const small = (L ? 6.5 : 7.5) * p.nameSize;
    if (a && b) lines.push([a, fit(a, small)], [b, fit(b, big)]);
    else if (a || b) lines.push([a || b, fit(a || b, big)]);
  }

  const c = coachLines(p.coaches);
  const coach = [c.head, c.assistants].filter((x): x is string => !!x);
  const coachSizes = coach.map((t) => fitText(t, "oswald", FONT_EM.oswald, L ? 2.5 : 2.6, avail, COACH_LS, SR + S_EXT));
  if (!lines.length && !coach.length) return null;

  const ts = letterShadow(k);
  const ink = smallInk(p, k);
  // The stack's box ends at the cap bottom of its last line; lift it so that
  // line's outline/drop stays inside m.
  const lastExt = coach.length ? S_EXT * coachSizes[coachSizes.length - 1] : EXT_BELOW * lines[lines.length - 1][1];

  return (
    <div
      style={abs({
        left: p.u(Lo.m),
        bottom: p.u(Lo.m + lastExt),
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        ...shadow(p, "drop-shadow(0 2px 5px rgba(0,0,0,0.4))"),
      })}
    >
      {lines.map(([t, size], i) => (
        <div key={i} style={{ display: "flex", flex: "none", marginTop: i ? p.u(EXT_BELOW * lines[i - 1][1] + 1.1 + accentLift(t, size)) : 0 }}>
          <CapLine
            family={p.nameFont.family}
            size={size}
            u={p.u}
            cap={cap}
            style={{
              color: k.fill,
              fontStyle: p.nameItalic ? "italic" : "normal",
              letterSpacing: em(NAME_LS),
              marginLeft: em(EXT_LT),
              textShadow: ts,
            }}
          >
            {t}
          </CapLine>
        </div>
      ))}
      {coach.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            flex: "none",
            marginTop: lines.length ? p.u(EXT_BELOW * lines[lines.length - 1][1] + 1.4) : 0,
          }}
        >
          <Stripe p={p} k={k} mt={0} mb={1.4} />
          {coach.map((t, i) => (
            <div key={i} style={{ display: "flex", flex: "none", marginTop: i ? p.u(1) : 0 }}>
              <SmallLine p={p} text={t} size={coachSizes[i]} ls={COACH_LS} ink={ink} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const varsity: FrontDesign = {
  id: "varsity",
  name: "Varsity",
  nameFont: "bungee",
  render: (p) => {
    const Lo = layout(p);
    const k = inks(p);
    return (
      <>
        <Team p={p} Lo={Lo} k={k} />
        <Jersey p={p} Lo={Lo} k={k} />
        <Bottom p={p} Lo={Lo} k={k} />
      </>
    );
  },
  // Right-aligned under the number (and under the team block too if the stamp
  // is wider than the number), or under the team block when there is no number
  // — the team name may then run all the way to the right edge.
  circulation: (p) => {
    const Lo = layout(p);
    let top = Lo.teamBottom + 2;
    if (Lo.jersey) {
      top = Lo.jersey.bottom + 1.8;
      if (p.W - Lo.m - STAMP_W < Lo.right + 2) top = Math.max(top, Lo.teamBottom + 1.8);
    }
    return { top: `${+((top / p.H) * 100).toFixed(2)}%`, right: `${+((Lo.m / p.W) * 100).toFixed(2)}%` };
  },
};
