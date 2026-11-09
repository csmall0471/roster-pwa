// Marker — a handmade scrapbook front. Every piece is hand-lettered in
// Permanent Marker on a strip of torn tape (jagged clip-path ends, a faint
// fibre texture), laid down at small alternating tilts:
//   - team name on a big primary tape, age · season on a small secondary tape
//     tucked under it;
//   - the jersey number on a round primary sticker, circled by hand in the
//     secondary color and held on with a scrap of clear tape;
//   - first name on a small secondary tape over the last name on a big
//     primary tape (group cards: one big tape);
//   - coaches on thin secondary tape strips under the name.
//
// Geometry notes (all in u = % of the card's short edge):
//   - Each tilted piece rotates about the corner that keeps it inside the
//     card: the team block tilts counter-clockwise about its right-top corner
//     (nothing rises above its top; the right edge moves out by at most
//     height·sinθ), and bottom pieces pivot on a bottom corner so nothing
//     drops toward the bottom trim.
//   - Torn ends are cut inside the padding, so text never touches a jag.
//   - Everything is a flex column (no inline line-box strut).
//
// The card back (./marker-back.tsx) reuses the tape, the team block and the
// text fitting exported here, so both sides are taped up from one kit.

import type { CSSProperties, ReactNode } from "react";
import {
  FONTS,
  FONT_EM,
  SAFE,
  abs,
  coachLines,
  coachText,
  fitSize,
  luminance,
  shadow,
  subLine,
  teamOrPlaceholder,
  type FrontDesign,
  type FrontDesignProps,
} from "./shared";

export const MK = FONTS.marker;
export const EM = FONT_EM.marker;
export const SIN = (deg: number) => Math.sin((Math.abs(deg) * Math.PI) / 180);

// Tilts (deg, negative = counter-clockwise).
export const TILT_TEAM = -3.5;
const TILT_SUB = 4; // relative to the team block → about +0.5° on the card
const TILT_FIRST = 2.4;
const TILT_LAST = -1.6;
const TILT_COACH = 1;

export const TAPE_SHADOW = "drop-shadow(0 2px 3px rgba(0,0,0,0.38))";

// ── Text fitting ────────────────────────────────────────────────────────────

// FONT_EM is an average over mixed samples (spaces included), so a single
// word of wide capitals (KOWALCZYK, VANDERHOOVEN) runs 6–13% wider than it
// predicts. Weight each character by its width class (measured across all
// the card fonts, relative to FONT_EM) to stay within ~4% for any font.
export function widthFactor(text: string): number {
  const cs = [...text];
  if (!cs.length) return 1;
  let sum = 0;
  for (const c of cs) {
    if (c === "M" || c === "W") sum += 1.47;
    else if (c === " ") sum += 0.47;
    else if (c === "I" || c === "J" || c === "1") sum += 0.94;
    else if (".,'-".includes(c)) sum += 0.73;
    else sum += 1.06;
  }
  return sum / cs.length;
}

const FIT = 0.95; // headroom on top of the per-character estimate

export function fit(text: string, base: number, avail: number, em: number, ls = 0): number {
  return fitSize(text, base, avail * FIT, em * widthFactor(text), ls);
}

// As fit(), plus `lean` em of extra width (an italic's overhang).
function fitLean(text: string, base: number, avail: number, em: number, ls: number, lean: number): number {
  const n = [...text].length * widthFactor(text) || 1;
  return fit(text, base, avail, em + lean / n, ls);
}

// Estimated rendered width (u) of nowrap text.
export function textW(text: string, size: number, em: number, ls = 0): number {
  return [...text].length * (em * widthFactor(text) + ls) * size;
}

// ── Geometry ────────────────────────────────────────────────────────────────

export type Geo = {
  edge: number; // plate distance from the trim (left / right / bottom)
  top: number; // team block top
  jersey: { D: number; top: number; right: number; left: number; bottom: number } | null;
  // Card back only: the plates' right limit (u, tilt slack included) and a
  // scale on the team/sub base sizes so the block fits above the panel.
  plateRight?: number;
  teamScale?: number;
};

function geo(p: FrontDesignProps): Geo {
  const framed = !!p.frame;
  // Framed: ≥ inset + 1 from every edge, plus room for the tilted corners.
  const edge = framed ? p.inset + 2 : 3.5;
  const top = framed ? p.inset + 2 : 4.5;
  if (!p.jersey) return { edge, top, jersey: null };
  const D = p.landscape ? 14 : 15;
  // The clear-tape scrap reaches ~2.3u above and ~1.1u right of the sticker.
  const jt = framed ? p.inset + 4 : 6;
  const jr = framed ? p.inset + 3 : 5.5;
  return { edge, top, jersey: { D, top: jt, right: jr, left: p.W - jr - D, bottom: jt + D } };
}

// ── Tape ────────────────────────────────────────────────────────────────────

// Fractions of the tear depth down each torn end (top → bottom).
const JAGS = [
  [0.15, 0.85, 0.3, 1, 0.5, 0.9, 0.1],
  [0.75, 0.2, 1, 0.4, 0.85, 0.05, 0.6],
  [0.45, 1, 0.1, 0.75, 0.3, 0.95, 0.25],
  [0.9, 0.35, 0.65, 0.05, 1, 0.5, 0.8],
];

export function torn(p: FrontDesignProps, seed: number, depth: number): string {
  const a = JAGS[seed % JAGS.length];
  const b = JAGS[(seed + 1) % JAGS.length];
  const n = a.length - 1;
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) pts.push(`calc(100% - ${p.u(depth * b[i])}) ${+((i / n) * 100).toFixed(2)}%`);
  for (let i = n; i >= 0; i--) pts.push(`${p.u(depth * a[i])} ${+((i / n) * 100).toFixed(2)}%`);
  return `polygon(${pts.join(", ")})`;
}

// Solid tape color with a soft sheen and faint diagonal fibres.
export function tapeBg(p: FrontDesignProps, color: string): string {
  return [
    "linear-gradient(178deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 40%, rgba(0,0,0,0.08) 100%)",
    `repeating-linear-gradient(100deg, rgba(0,0,0,0.04) 0 ${p.u(0.35)}, rgba(0,0,0,0) ${p.u(0.35)} ${p.u(1.25)})`,
    color,
  ].join(", ");
}

export function Tape(props: {
  p: FrontDesignProps;
  bg: string;
  fg: string;
  seed: number;
  depth?: number;
  pad: [number, number, number, number]; // u: top right bottom left
  style?: CSSProperties;
  children: ReactNode;
}) {
  const { p, bg, fg, seed, depth = 0.8, pad, style, children } = props;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        background: tapeBg(p, bg),
        color: fg,
        padding: pad.map((n) => p.u(n)).join(" "),
        clipPath: torn(p, seed, depth),
        whiteSpace: "nowrap",
        lineHeight: 1.12,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Team block ──────────────────────────────────────────────────────────────

const TEAM_PAD: [number, number, number, number] = [1.1, 2.6, 0.7, 2.4];
const SUB_PAD: [number, number, number, number] = [0.7, 1.9, 0.5, 1.9];
const SUB_INDENT = 3;
const TEAM_LS = 0.02;
const SUB_LS = 0.06;

export function teamMetrics(p: FrontDesignProps, g: Geo) {
  const team = teamOrPlaceholder(p);
  const sub = subLine(p).toUpperCase();
  // Right limit for the plates. The block's tilt pushes its right edge out by
  // at most height·sinθ (≈1u), so subtract that too. With a jersey the plate
  // stops 2.5u (the text ≥ 5u) short of the sticker.
  const slack = 1.1;
  const plateRight = g.plateRight ?? (g.jersey ? g.jersey.left - 2.5 - slack : p.W - g.edge - slack);
  const span = plateRight - g.edge;
  const k = g.teamScale ?? 1;
  const ts = fit(team, 7.4 * k, span - TEAM_PAD[1] - TEAM_PAD[3], EM, TEAM_LS);
  const ss = fit(sub, 3.2 * k, span - SUB_INDENT - SUB_PAD[1] - SUB_PAD[3], EM, SUB_LS);
  const teamH = ts * 1.12 + TEAM_PAD[0] + TEAM_PAD[2];
  const subH = sub ? ss * 1.12 + SUB_PAD[0] + SUB_PAD[2] - 0.4 : 0;
  const width = Math.max(
    textW(team, ts, EM, TEAM_LS) + TEAM_PAD[1] + TEAM_PAD[3],
    sub ? SUB_INDENT + textW(sub, ss, EM, SUB_LS) + SUB_PAD[1] + SUB_PAD[3] : 0
  );
  // The sub tape tilts +TILT_SUB° about its left end, so its right end sits
  // lower than its box by its width·sinθ — anything placed under the block
  // (the circulation stamp) has to clear that.
  const subW = sub ? SUB_INDENT + textW(sub, ss, EM, SUB_LS) + SUB_PAD[1] + SUB_PAD[3] : 0;
  const subDrop = subW * Math.sin((TILT_SUB * Math.PI) / 180);
  return { team, sub, ts, ss, height: teamH + subH, width, subDrop };
}

export function Team({ p, g }: { p: FrontDesignProps; g: Geo }) {
  const m = teamMetrics(p, g);
  return (
    <div
      style={abs({
        left: p.u(g.edge),
        top: p.u(g.top),
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        transform: `rotate(${TILT_TEAM}deg)`,
        transformOrigin: "right top",
        ...shadow(p, TAPE_SHADOW),
      })}
    >
      <Tape
        p={p}
        bg={p.palette.background}
        fg={p.palette.color}
        seed={0}
        pad={TEAM_PAD}
        style={{ fontFamily: MK, fontSize: p.u(m.ts), letterSpacing: `${TEAM_LS}em` }}
      >
        {m.team}
      </Tape>
      {m.sub && (
        <Tape
          p={p}
          bg={p.palette.subBackground}
          fg={p.palette.subColor}
          seed={2}
          depth={0.6}
          pad={SUB_PAD}
          style={{
            fontFamily: MK,
            fontSize: p.u(m.ss),
            letterSpacing: `${SUB_LS}em`,
            marginLeft: p.u(SUB_INDENT),
            marginTop: p.u(-0.4),
            transform: `rotate(${TILT_SUB}deg)`,
            transformOrigin: "left top",
          }}
        >
          {m.sub}
        </Tape>
      )}
    </div>
  );
}

// ── Jersey ──────────────────────────────────────────────────────────────────

function Jersey({ p, g }: { p: FrontDesignProps; g: Geo }) {
  const j = g.jersey;
  if (!j) return null;
  const bg = p.palette.background;
  // Hand-drawn ring in the secondary color, unless it would vanish on the tag.
  const ring =
    Math.abs(luminance(p.palette.subBackground) - luminance(bg)) > 0.06 ? p.palette.subBackground : p.palette.color;
  // Number inside the ring (inner width ≈ D − 4u); the "#" is drawn at 0.6em.
  const glyphs = [...p.jersey].length * widthFactor(p.jersey) + 0.6 * 1.13;
  const fs = Math.max(0.5, Math.min(7, ((j.D - 6.2) * FIT) / (glyphs * EM)));
  return (
    <div style={abs({ top: p.u(j.top), right: p.u(j.right), width: p.u(j.D), height: p.u(j.D), ...shadow(p, TAPE_SHADOW) })}>
      {/* the sticker */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: tapeBg(p, bg),
          borderRadius: "52% 48% 55% 45% / 47% 55% 45% 53%",
          transform: "rotate(7deg)",
        }}
      />
      {/* hand-drawn circle: one full loop plus an overshooting second stroke */}
      <div
        style={{
          position: "absolute",
          inset: p.u(1.5),
          border: `${p.u(0.5)} solid ${ring}`,
          borderRadius: "46% 54% 50% 50% / 55% 45% 55% 45%",
          transform: "rotate(-14deg)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: `${p.u(1.1)} ${p.u(1.9)} ${p.u(1.7)} ${p.u(1.2)}`,
          border: `${p.u(0.4)} solid transparent`,
          borderTopColor: ring,
          borderLeftColor: ring,
          borderRadius: "50%",
          transform: "rotate(28deg)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: MK,
          fontSize: p.u(fs),
          lineHeight: 1,
          color: p.palette.color,
          transform: "rotate(-6deg)",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: "0.6em", marginRight: "0.04em" }}>#</span>
        {p.jersey}
      </div>
      {/* scrap of clear tape holding the sticker on */}
      <div
        style={{
          position: "absolute",
          width: p.u(8),
          height: p.u(2.8),
          left: `calc(80% - ${p.u(4)})`,
          top: `calc(8% - ${p.u(1.4)})`,
          background: "rgba(255,255,255,0.5)",
          clipPath: torn(p, 1, 0.5),
          transform: "rotate(35deg)",
        }}
      />
    </div>
  );
}

// ── Name + coaches ──────────────────────────────────────────────────────────

const FIRST_INDENT = 4;
const COACH_INDENT = 3;
const COACH_PAD_X = 1.8;
const COACH_LS = 0.04;

function Name({ p, g }: { p: FrontDesignProps; g: Geo }) {
  let small = "";
  let big = "";
  if (p.isGroup) big = (p.nameLines[0] ?? "").toUpperCase();
  else {
    small = p.nameLines[0] ?? "";
    big = p.nameLines[1] ?? "";
    if (!big) [big, small] = [small, ""];
  }

  const span = p.W - 2 * g.edge; // plate span in u
  const nem = p.nameFont.em;
  // A synthesized italic leans past the last glyph's advance; pad for it.
  const lean = p.nameItalic ? 0.14 : 0;
  // Landscape has less height for the bottom zone; trim the name a little.
  const scale = p.nameSize * (p.landscape ? 0.92 : 1);

  const bigPadX = 2.6;
  const bs = fitLean(big, (p.isGroup ? 9 : 11) * scale, span - 2 * bigPadX, nem, 0.01, lean);
  const smallPadX = 2;
  const sms = fitLean(small, 6.2 * scale, span - FIRST_INDENT - 2 * smallPadX, nem, 0.02, lean);

  // Coaches: one strip if it stays readable, else head / assistants strips.
  const one = coachText(p.coaches);
  const coachSpan = span - COACH_INDENT - 2 - 2 * COACH_PAD_X; // 2 = second strip's extra indent
  let coach: Array<{ text: string; size: number }> = [];
  if (one) {
    const s1 = fit(one, 2.9, coachSpan, EM, COACH_LS);
    const cl = coachLines(p.coaches);
    coach =
      s1 >= 2.5
        ? [{ text: one, size: s1 }]
        : [cl.head, cl.assistants]
            .filter((t): t is string => !!t)
            .map((t) => ({ text: t, size: fit(t, 2.9, coachSpan, EM, COACH_LS) }));
  }

  // The big tape's top edge rises by x·sin|TILT_LAST| under the first name's
  // fixed right-bottom corner; keep the text apart and let the tapes overlap.
  const smallW = small ? FIRST_INDENT + textW(small, sms, nem, 0.02) + 2 * smallPadX : 0;
  const firstGap = Math.max(0.3, smallW * SIN(TILT_LAST) - 1.2);

  return (
    <div
      style={abs({
        left: p.u(g.edge),
        bottom: p.u(g.edge + (p.frame ? 0 : 0.5)),
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        fontFamily: p.nameFont.family,
        fontStyle: p.nameItalic ? "italic" : "normal",
        ...shadow(p, TAPE_SHADOW),
      })}
    >
      {small && (
        <Tape
          p={p}
          bg={p.palette.subBackground}
          fg={p.palette.subColor}
          seed={3}
          depth={0.7}
          pad={[0.16 * sms, smallPadX + lean * sms, 0.08 * sms, smallPadX]}
          style={{
            fontSize: p.u(sms),
            letterSpacing: "0.02em",
            marginLeft: p.u(FIRST_INDENT),
            marginBottom: p.u(firstGap),
            transform: `rotate(${TILT_FIRST}deg)`,
            transformOrigin: "right bottom",
            position: "relative",
            zIndex: 2,
          }}
        >
          {small}
        </Tape>
      )}
      {big && (
        <Tape
          p={p}
          bg={p.palette.background}
          fg={p.palette.color}
          seed={1}
          depth={1}
          pad={[0.14 * bs, bigPadX + lean * bs, 0.06 * bs, bigPadX]}
          style={{
            fontSize: p.u(bs),
            letterSpacing: "0.01em",
            transform: `rotate(${TILT_LAST}deg)`,
            transformOrigin: "left bottom",
          }}
        >
          {big}
        </Tape>
      )}
      {coach.map((c, i) => {
        // Strip 0 tilts clockwise about its right-bottom corner (its left end
        // lifts toward the name tape); strip 1 counter-clockwise about its
        // left-bottom corner (its right end lifts toward strip 0). Open the gap
        // by that lift, minus the padding the two plates already provide.
        const w = textW(c.text, c.size, EM, COACH_LS) + 2 * COACH_PAD_X;
        return (
          <Tape
            key={i}
            p={p}
            bg={p.palette.subBackground}
            fg={p.palette.subColor}
            seed={2 + i}
            depth={0.5}
            pad={[0.55, COACH_PAD_X, 0.45, COACH_PAD_X]}
            style={{
              fontFamily: MK,
              fontStyle: "normal",
              fontSize: p.u(c.size),
              letterSpacing: `${COACH_LS}em`,
              marginLeft: p.u(COACH_INDENT + i * 2),
              marginTop: p.u(Math.max(0.4, w * SIN(TILT_COACH) - 0.9)),
              transform: `rotate(${i % 2 ? -TILT_COACH : TILT_COACH}deg)`,
              transformOrigin: i % 2 ? "left bottom" : "right bottom",
            }}
          >
            {c.text}
          </Tape>
        );
      })}
    </div>
  );
}

// ── Design ──────────────────────────────────────────────────────────────────

export const marker: FrontDesign = {
  id: "marker",
  name: "Marker",
  nameFont: "marker",
  render: (p) => {
    const g = geo(p);
    return (
      <>
        <Team p={p} g={g} />
        <Jersey p={p} g={g} />
        <Name p={p} g={g} />
      </>
    );
  },
  // The stamp goes under the jersey sticker. Without a jersey it stays in the
  // top-right corner when the team tape is short enough to leave room for it
  // (≈26u wide), else it drops below the team block.
  circulation: (p) => {
    const g = geo(p);
    const right = Math.max(SAFE + 2, g.edge + 2);
    if (g.jersey) return { top: p.u(g.jersey.bottom + 2.5), right: p.u(g.jersey.right) };
    const m = teamMetrics(p, g);
    if (g.edge + m.width + 3.5 < p.W - right - 28) return { top: p.u(g.top + 2), right: p.u(right) };
    return { top: p.u(g.top + m.height + m.subDrop + 3.5), right: p.u(right) };
  },
};
