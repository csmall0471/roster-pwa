// Stamp — rubber stamp / shipping label. Every piece is a double-ruled plate
// (outer rule in the other team color, inner rule + text in the ink): a team
// box tilted counter-clockwise (top-left), a round "NO." jersey seal whose
// number tilts the other way (top-right), and a name label at the bottom with
// the coaches stamped under a dashed tear line. Black Ops One stencil + Geist
// caps.
//
// Geometry is computed in u (see layout()) so the team box can be fitted to
// stop short of the jersey stamp, and so the limited-edition stamp can be
// placed under whichever of the two reaches lower.
//
// The card back (./stamp-back.tsx) reuses the team box, the inks and the
// double-rule sizes exported here, so both sides are stamped from one set.

import type { CSSProperties } from "react";
import {
  accentLift,
  FONTS,
  FONT_EM,
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

// ── Tilts ────────────────────────────────────────────────────────────────────

export const TEAM_TILT = -4; // counter-clockwise; rotated about its right-top corner
const NAME_TILT = -2; // counter-clockwise; rotated about its left-top corner
export const JERSEY_TILT = 7; // the number turns inside a circle (bounds unchanged)
export const sinDeg = (d: number) => Math.abs(Math.sin((d * Math.PI) / 180));

// ── Colors ───────────────────────────────────────────────────────────────────

function contrast(a: string, b: string) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Plates are the primary color and the jersey seal the secondary. Ink (text +
// inner rule) is the other team color when it reads well on the plate,
// otherwise the palette's readable white/black. The outer rule of each plate is
// drawn in the other team color so both colors show on every piece.
export function inks(p: FrontDesignProps) {
  const P = p.palette;
  const ink = contrast(P.background, P.subBackground) >= 4.5 ? P.subBackground : P.color;
  const sealInk = contrast(P.subBackground, P.background) >= 4.5 ? P.background : P.subColor;
  const distinct = contrast(P.background, P.subBackground) >= 1.4;
  return {
    plate: P.background,
    ink,
    rule: distinct ? P.subBackground : ink,
    seal: P.subBackground,
    sealInk,
    sealRule: distinct ? P.background : sealInk,
  };
}

// ── Text widths ──────────────────────────────────────────────────────────────

// Advance of each character relative to its font's average uppercase advance
// (FONT_EM / nameFont.em), averaged over the seven display fonts in Chrome —
// the proportions agree across fonts within a few percent. A flat average
// runs ~20% narrow for names like WOODWARD (W and M are ~1.45×) and wide for
// names with spaces and I's, so text is fitted with its own average instead.
const REL: Record<string, number> = {
  A: 1.11, B: 1.11, C: 1.05, D: 1.1, E: 0.99, F: 0.93, G: 1.14, H: 1.16, I: 0.66, J: 0.94, K: 1.13, L: 0.96, M: 1.45,
  N: 1.14, O: 1.14, P: 1.07, Q: 1.14, R: 1.11, S: 1.02, T: 0.96, U: 1.13, V: 1.05, W: 1.47, X: 1.07, Y: 1.0, Z: 0.98,
  "0": 1.09, "1": 0.84, "2": 1.04, "3": 1.03, "4": 1.04, "5": 1.03, "6": 1.03, "7": 0.99, "8": 1.04, "9": 1.04,
  " ": 0.47, "&": 1.16, ".": 0.5, ",": 0.5, "-": 0.73, "'": 0.47, "·": 0.5,
};

// Average advance (em per character) of `text` in a font whose average
// uppercase advance is `em`, with a 4% margin. Lowercase is measured as
// uppercase (it is narrower, so this errs small).
export function textEm(text: string, em: number): number {
  const chars = [...text.toUpperCase()];
  if (!chars.length) return em;
  const rel = chars.reduce((w, ch) => w + (REL[ch] ?? 1.15), 0) / chars.length;
  return em * rel * 1.04;
}

// ── Layout (all in u) ────────────────────────────────────────────────────────

// Double rule: outer rule, plate-colored gap, inner rule.
export const R1 = 0.6;
export const GAP = 0.55;
export const R2 = 0.28;
export const RULES = R1 + GAP + R2;

const TEAM_PX = 2.4;
const TEAM_PT = 1.5;
const TEAM_PB = 1.3;
const TEAM_LS = 0.05;
const SUB_LS = 0.24;
const SUB_GAP = 1.1; // team name → rule
const SUB_PAD = 1.0; // rule → age · season
const TEAM_MAX_TEXT = 62;

const SEAL = 16; // jersey stamp diameter

const NAME_PX = 2.6;
const NAME_PT = 1.5;
const NAME_PB = 1.5;
const LINE1_LS = 0.16;
const LINE2_LS = 0.02;
const COACH_LS = 0.14;
const COACH_GAP = 1.3; // name → dashed rule
const COACH_PAD = 1.0; // dashed rule → coaches

// Team box text sizes and outer size (u) for a box whose left edge is at `sx`
// and whose tilted bottom-right corner must stop at `rightLimit`.
export function teamBox(p: FrontDesignProps, sx: number, rightLimit: number) {
  const team = teamOrPlaceholder(p).toUpperCase();
  const sub = subLine(p).toUpperCase();
  const teamH0 = 2 * RULES + TEAM_PT + TEAM_PB + 6.4 + (sub ? SUB_GAP + R2 + SUB_PAD + 2.3 : 0);
  // The tilt pushes the bottom-right corner out by h·sin(tilt).
  const boxMax = rightLimit - sx - teamH0 * sinDeg(TEAM_TILT);
  const textMax = Math.min(TEAM_MAX_TEXT, boxMax - 2 * (RULES + TEAM_PX));
  // +1 character: the centering pad that offsets the trailing letter-spacing.
  const teamEm = textEm(team, FONT_EM.stencil);
  const teamN = [...team].length;
  const teamSize = fitSize(team, 6.4, textMax, teamEm + TEAM_LS / teamN, TEAM_LS);
  const subN = [...sub].length;
  const subSize = fitSize(sub, 2.3, textMax, FONT_EM.sans + SUB_LS / Math.max(1, subN), SUB_LS);
  const teamText = Math.max(
    (teamEm * teamN + TEAM_LS * (teamN + 1)) * teamSize,
    sub ? (FONT_EM.sans * subN + SUB_LS * (subN + 1)) * subSize : 0
  );
  const teamW = teamText + 2 * (RULES + TEAM_PX);
  const teamH = 2 * RULES + TEAM_PT + TEAM_PB + teamSize + (sub ? SUB_GAP + R2 + SUB_PAD + subSize : 0);
  return { team, sub, teamSize, subSize, teamW, teamH };
}

function layout(p: FrontDesignProps) {
  const framed = !!p.frame;
  const edge = framed ? p.inset + 1 : 0; // plates keep clear of the frame band + keyline
  const sx = framed ? edge : 4.5; // plate inset from the left/right trim
  const top = framed ? edge : 4;

  // Jersey seal.
  const hasJersey = !!p.jersey;
  const sealRight = framed ? edge : 5;
  const sealTop = top;
  const sealLeft = p.W - sealRight - SEAL;
  const sealSize = fitSize(p.jersey, 7, 9.4, textEm(p.jersey, FONT_EM.stencil), 0.02);

  // Team box.
  const rightLimit = hasJersey ? sealLeft - 3 : p.W - sx;

  return {
    framed,
    sx,
    top,
    hasJersey,
    sealRight,
    sealTop,
    sealLeft,
    sealSize,
    ...teamBox(p, sx, rightLimit),
    bottom: framed ? edge : 5,
  };
}

type L = ReturnType<typeof layout>;
// What the team box needs: its top-left corner (u) plus teamBox()'s sizes.
export type TeamGeo = ReturnType<typeof teamBox> & { top: number; sx: number };

// ── Pieces ───────────────────────────────────────────────────────────────────

// Outer plate + inner rule of a double-ruled box.
function ruled(p: FrontDesignProps, plate: string, rule: string, ink: string): { outer: CSSProperties; inner: CSSProperties } {
  return {
    outer: {
      display: "flex",
      flexDirection: "column",
      background: plate,
      border: `${p.u(R1)} solid ${rule}`,
      padding: p.u(GAP),
      boxSizing: "border-box",
    },
    inner: {
      display: "flex",
      flexDirection: "column",
      border: `${p.u(R2)} solid ${ink}`,
      color: ink,
      boxSizing: "border-box",
    },
  };
}

// The team box (also the card back's header).
export function Team({ p, l }: { p: FrontDesignProps; l: TeamGeo }) {
  const c = inks(p);
  const box = ruled(p, c.plate, c.rule, c.ink);
  return (
    <div style={abs({ top: p.u(l.top), left: p.u(l.sx), ...shadow(p, "drop-shadow(0 3px 7px rgba(0,0,0,0.4))") })}>
      <div style={{ ...box.outer, transform: `rotate(${TEAM_TILT}deg)`, transformOrigin: "right top" }}>
        <div
          style={{
            ...box.inner,
            alignItems: "center",
            padding: `${p.u(TEAM_PT)} ${p.u(TEAM_PX)} ${p.u(TEAM_PB)}`,
          }}
        >
          <div
            style={{
              fontFamily: FONTS.stencil,
              fontSize: p.u(l.teamSize),
              letterSpacing: `${TEAM_LS}em`,
              paddingLeft: `${TEAM_LS}em`,
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            {l.team}
          </div>
          {l.sub && (
            <div
              style={{
                alignSelf: "stretch",
                marginTop: p.u(SUB_GAP),
                paddingTop: p.u(SUB_PAD),
                borderTop: `${p.u(R2)} solid ${c.ink}`,
                display: "flex",
                justifyContent: "center",
                fontFamily: FONTS.sans,
                fontWeight: 800,
                fontSize: p.u(l.subSize),
                letterSpacing: `${SUB_LS}em`,
                lineHeight: 1,
                whiteSpace: "nowrap",
              }}
            >
              <span style={{ paddingLeft: `${SUB_LS}em` }}>{l.sub}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Seal({ p, l }: { p: FrontDesignProps; l: L }) {
  if (!l.hasJersey) return null;
  const c = inks(p);
  return (
    <div
      style={abs({
        top: p.u(l.sealTop),
        right: p.u(l.sealRight),
        width: p.u(SEAL),
        height: p.u(SEAL),
        borderRadius: "9999px",
        background: c.seal,
        border: `${p.u(R1)} solid ${c.sealRule}`,
        boxSizing: "border-box",
        ...shadow(p, "drop-shadow(0 3px 7px rgba(0,0,0,0.4))"),
      })}
    >
      <div
        style={{
          position: "absolute",
          inset: p.u(GAP + 0.25),
          borderRadius: "9999px",
          border: `${p.u(R2)} solid ${c.sealInk}`,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: c.sealInk,
          transform: `rotate(${JERSEY_TILT}deg)`,
        }}
      >
        <div
          style={{
            fontFamily: FONTS.sans,
            fontWeight: 800,
            fontSize: p.u(1.7),
            letterSpacing: "0.22em",
            paddingLeft: "0.22em",
            lineHeight: 1,
          }}
        >
          NO.
        </div>
        <div
          style={{
            fontFamily: FONTS.stencil,
            fontSize: p.u(l.sealSize),
            letterSpacing: "0.02em",
            lineHeight: 1,
            marginTop: p.u(0.5),
            whiteSpace: "nowrap",
          }}
        >
          {p.jersey}
        </div>
      </div>
    </div>
  );
}

function Name({ p, l }: { p: FrontDesignProps; l: L }) {
  const c = inks(p);
  const box = ruled(p, c.plate, c.rule, c.ink);
  const lines = p.nameLines.map((s) => s.trim()).filter(Boolean);
  const coaches = coachText(p.coaches);
  if (!lines.length && !coaches) return null;

  // Widest the label may get (u), less the tilt's sideways push (≈ h·sin).
  const maxW = Math.min(p.W - 2 * l.sx - 1.2, p.landscape ? 98 : 999);
  const avail = maxW - 2 * (RULES + NAME_PX);
  // Landscape has ~32u for name + coaches, so the size multiplier is capped.
  const ns = p.landscape ? Math.min(p.nameSize, 1.25) : p.nameSize;
  // Average advance per character, plus the italic overhang (~0.2em) spread
  // over the string.
  const em = (t: string) => textEm(t, p.nameFont.em) + (p.nameItalic ? 0.2 / Math.max(1, [...t].length) : 0);

  // One line (group, or a solo card with a single name) is set big; two lines
  // set line 1 small above a big line 2.
  const single = p.isGroup || lines.length < 2;
  const bigBase = (p.isGroup ? 8 : 10.5) * ns;
  const big = lines.length ? (single ? lines[0] : lines[1]) : "";
  const bigText = p.isGroup ? big.toUpperCase() : big;
  const small = !single ? lines[0] : "";
  const bigSize = fitSize(bigText, bigBase, avail, em(bigText), LINE2_LS);
  const smallSize = fitSize(small, 4.6 * ns, avail, em(small), LINE1_LS);

  // Coaches: one stamped line when it fits at a readable size, else head and
  // assistants on two lines.
  const cl = coachLines(p.coaches);
  const oneSize = fitSize(coaches, 2.2, avail, FONT_EM.sans, COACH_LS);
  const coachRows = !coaches
    ? []
    : oneSize >= 2.05 || !cl.head || !cl.assistants
      ? [{ text: coaches, size: oneSize }]
      : [cl.head, cl.assistants].map((t) => ({ text: t as string, size: fitSize(t as string, 2.2, avail, FONT_EM.sans, COACH_LS) }));

  return (
    <div style={abs({ bottom: p.u(l.bottom), left: p.u(l.sx), ...shadow(p, "drop-shadow(0 3px 8px rgba(0,0,0,0.42))") })}>
      <div
        style={{
          ...box.outer,
          minWidth: p.u(p.landscape ? 58 : 50),
          transform: `rotate(${NAME_TILT}deg)`,
          transformOrigin: "left top",
        }}
      >
        <div
          style={{
            ...box.inner,
            alignItems: "flex-start",
            padding: `${p.u(NAME_PT)} ${p.u(NAME_PX)} ${p.u(NAME_PB)}`,
          }}
        >
          {small && (
            <div
              style={{
                fontFamily: p.nameFont.family,
                fontStyle: p.nameItalic ? "italic" : "normal",
                fontSize: p.u(smallSize),
                letterSpacing: `${LINE1_LS}em`,
                lineHeight: 1,
                whiteSpace: "nowrap",
              }}
            >
              {small}
            </div>
          )}
          {bigText && (
            <div
              style={{
                fontFamily: p.nameFont.family,
                fontStyle: p.nameItalic ? "italic" : "normal",
                fontSize: p.u(bigSize),
                letterSpacing: `${LINE2_LS}em`,
                lineHeight: 0.92,
                marginTop: small ? p.u(0.9 + accentLift(bigText, bigSize)) : 0,
                whiteSpace: "nowrap",
              }}
            >
              {bigText}
            </div>
          )}
          {coachRows.length > 0 && (
            <div
              style={{
                alignSelf: "stretch",
                display: "flex",
                flexDirection: "column",
                gap: p.u(0.7),
                marginTop: lines.length ? p.u(COACH_GAP) : 0,
                paddingTop: lines.length ? p.u(COACH_PAD) : 0,
                borderTop: lines.length ? `${p.u(R2)} dashed ${c.ink}` : undefined,
              }}
            >
              {coachRows.map((r) => (
                <div
                  key={r.text}
                  style={{
                    fontFamily: FONTS.sans,
                    fontWeight: 800,
                    fontSize: p.u(r.size),
                    letterSpacing: `${COACH_LS}em`,
                    lineHeight: 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.text}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Design ───────────────────────────────────────────────────────────────────

export const stamp: FrontDesign = {
  id: "stamp",
  name: "Stamp",
  nameFont: "black-ops",
  render: (p) => {
    const l = layout(p);
    return (
      <>
        <Team p={p} l={l} />
        <Seal p={p} l={l} />
        <Name p={p} l={l} />
      </>
    );
  },
  // "LIMITED EDITION 1 / N" (≈26u × 6u, right-aligned): under the jersey seal,
  // and under the team box too where the two overlap horizontally.
  circulation: (p) => {
    const l = layout(p);
    const right = l.framed ? p.inset + 1.5 : 6;
    const circLeft = p.W - right - 26;
    // Top-right corner when nothing is in the way.
    let top = l.framed ? p.inset + 1.8 : 6.5;
    if (l.hasJersey) top = Math.max(top, l.sealTop + SEAL + 2);
    const teamRight = l.sx + l.teamW + l.teamH * sinDeg(TEAM_TILT);
    if (teamRight > circLeft - 1.5) {
      // The tilted team box's bottom edge drops toward the left.
      const drop = Math.max(0, teamRight - circLeft) * Math.tan((Math.abs(TEAM_TILT) * Math.PI) / 180);
      top = Math.max(top, l.top + l.teamH + drop + 2);
    }
    return { top: p.u(top), right: p.u(right) };
  },
};
