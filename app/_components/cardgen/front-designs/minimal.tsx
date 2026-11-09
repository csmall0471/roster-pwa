// Minimal — clean editorial front. No plates: letter-spaced Bebas display type
// over thin accent rules, with small wide-tracked Geist caps for the details.
//   - Team (top-left): team name, a rule across the block, age · season.
//   - Jersey (top-right): a tiny "NO." label, a big number and a short rule.
//   - Name (bottom-left): a short rule, then the first name small and widely
//     tracked over a big last name (group cards: one line).
//   - Coaches: small caps line(s) under the name.
// Text sits straight on the photo, so with no colors picked it follows the
// card's light/dark text scheme. With team colors, primary is the type and
// secondary the rules; a color that would vanish into the card's scheme gets a
// halo (or hands its role to the other color) so everything stays legible.
//
// Vertical metrics (measured in Chrome): Bebas Neue ascent 0.90 / descent 0.30
// / caps 0.70 em, so line-height 0.8 + margin-bottom -0.1em makes the box
// exactly the cap height. Geist ascent 1.01 / descent 0.29 / caps 0.71 em, so
// line-height 0.72 does the same. Boxes = caps keeps every gap exact in u.
//
// The card back (./minimal-back) reuses the team block, its metrics and inks.

import type { CSSProperties } from "react";
import {
  accentLift,
  FONTS,
  abs,
  coachLines,
  fitSize,
  luminance,
  subLine,
  teamOrPlaceholder,
  type FrontDesign,
  type FrontDesignProps,
} from "./shared";

// Uppercase advance widths (em) measured without spaces — slightly wider than
// FONT_EM so fitted text errs on the small side.
export const BEBAS_EM = 0.385;
const DIGIT_EM = 0.4; // Bebas figures are tabular
export const SANS_EM = 0.665; // Geist 600 caps

const TEAM_LS = 0.16;
const SMALL_LS = 0.3;
export const RULE = 0.5; // accent rule thickness (u)
const SHORT_RULE = 8; // length of the jersey / name rules (u)

// Cap-height boxes (see header).
const BEBAS_BOX: CSSProperties = { fontFamily: FONTS.bebas, lineHeight: 0.8, marginBottom: "-0.1em" };
const SANS_BOX: CSSProperties = { fontFamily: FONTS.sans, fontWeight: 600, lineHeight: 0.72 };

// ── Layout ───────────────────────────────────────────────────────────────────

function layout(p: FrontDesignProps) {
  // Side / top / bottom margins (u). Framed: clear the keyline (ends 6.2u).
  const framed = !!p.frame;
  const side = framed ? p.inset + 2 : 7;
  const top = framed ? p.inset + 2 : p.landscape ? 6.5 : 7;
  const bottom = framed ? p.inset + 2 : 7;

  // Jersey: "NO." label, number, rule — right-aligned at `side`.
  const label = 2.2;
  const labelW = 2.3 * label; // "NO." in Geist 600 + tracking, trailing cancelled
  const jerseyMax = p.landscape ? 13 : 16;
  const J = p.jersey ? fitSize(p.jersey, p.landscape ? 14.5 : 19, jerseyMax, DIGIT_EM, 0.02) : 0;
  const numW = [...p.jersey].length * DIGIT_EM * J;
  const jerseyRuleW = SHORT_RULE;
  const jerseyW = p.jersey ? Math.max(numW, labelW, jerseyRuleW) : 0;
  const gapLabel = 1.3;
  const gapRule = 1.8;
  const jerseyH = p.jersey ? label * 0.72 + gapLabel + J * 0.71 + gapRule + RULE : 0;

  // Team: right edge stays ≥ 3u (+ estimate slack) left of the jersey.
  const teamAvail = p.jersey ? p.W - side - jerseyW - 3.5 - side : p.W - 2 * side;

  return { side, top, bottom, label, J, jerseyW, jerseyRuleW, gapLabel, gapRule, jerseyH, ...teamFit(p, teamAvail) };
}

// Team block (team name, rule, age · season) fitted to `avail` u of width.
export function teamFit(p: FrontDesignProps, avail: number) {
  const team = teamOrPlaceholder(p);
  const T = fitSize(team, 9, avail, BEBAS_EM, TEAM_LS);
  const sub = subLine(p).toUpperCase();
  const S = sub ? fitSize(sub, 2.7, avail, SANS_EM, SMALL_LS) : 0;
  const teamRuleGap = 1.6;
  const subGap = 1.5;
  const teamH = T * 0.7 + teamRuleGap + RULE + (sub ? subGap + S * 0.72 : 0);
  const teamW = Math.max(
    [...team].length * (BEBAS_EM + TEAM_LS) * T,
    [...sub].length * (SANS_EM + SMALL_LS) * S
  );
  return { team, T, sub, S, teamRuleGap, subGap, teamH, teamW };
}

// Where the team block sits (top-left corner, u) plus its fitted metrics.
export type TeamGeom = { top: number; side: number } & ReturnType<typeof teamFit>;

// ── Color ────────────────────────────────────────────────────────────────────

export type Ink = {
  text: string; // display type (team, number, name)
  textShadow: string;
  small: string; // small caps (age · season, NO., coaches)
  smallShadow: string;
  accent: string; // rules
  ruleShadow?: string;
};

function contrast(a: number, b: number) {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function inks(p: FrontDesignProps): Ink {
  if (p.colorSource === "default") {
    return {
      text: p.textColor,
      textShadow: p.textShadow,
      small: p.textColor,
      smallShadow: p.textShadow,
      accent: p.textColor,
      ruleShadow: p.compact ? undefined : p.textShadow,
    };
  }
  // Light title text = a dark card, and the other way round. Reference
  // luminances are mid-tone photo backgrounds, not pure black / white, so a
  // teal on a green photo or a navy on a dark one counts as too close.
  const darkCard = luminance(p.textColor) > 0.5;
  const cardL = darkCard ? 0.05 : 0.7;
  const legible = (c: string) => contrast(luminance(c), cardL) >= 2.4;
  const primary = p.palette.background;
  const secondary = p.palette.subBackground;
  // Display type: a soft drop on dark cards, the editor's hairline on light.
  const soft = darkCard ? "0 0.02em 0.14em rgba(0,0,0,0.55)" : "0 0.02em 0 rgba(255,255,255,0.25)";
  // Small caps: a wider local glow in the card's own tone — invisible on the
  // plain background, it lifts the letters where they cross the photo.
  const glow = darkCard ? "0 0.04em 0.3em rgba(0,0,0,0.75)" : "0 0 0.35em rgba(255,255,255,0.75)";
  // Too close to the card: a tight halo in the scheme's text color keeps the
  // picked color but separates every letter from the photo.
  const h = darkCard ? "255,255,255" : "10,10,10";
  const halo = `0 0 0.03em rgba(${h},0.95), 0 0 0.03em rgba(${h},0.95), 0 0 0.06em rgba(${h},0.8), ${soft}`;
  const small = legible(primary) ? primary : legible(secondary) ? secondary : p.textColor;
  const accent = legible(secondary) ? secondary : legible(primary) ? primary : p.textColor;
  return {
    text: primary,
    textShadow: legible(primary) ? soft : halo,
    small,
    smallShadow: glow,
    accent,
    ruleShadow: p.compact || !darkCard ? undefined : `0 ${p.u(0.25)} ${p.u(1)} rgba(0,0,0,0.4)`,
  };
}

function Rule({ p, ink, style }: { p: FrontDesignProps; ink: Ink; style: CSSProperties }) {
  return <div style={{ height: p.u(RULE), background: ink.accent, boxShadow: ink.ruleShadow, flex: "none", ...style }} />;
}

// ── Pieces ───────────────────────────────────────────────────────────────────

export function MinimalTeam({ p, g, ink }: { p: FrontDesignProps; g: TeamGeom; ink: Ink }) {
  return (
    <div
      style={abs({
        top: p.u(g.top),
        left: p.u(g.side),
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
      })}
    >
      <div
        style={{
          ...BEBAS_BOX,
          fontSize: p.u(g.T),
          letterSpacing: `${TEAM_LS}em`,
          marginRight: `-${TEAM_LS}em`,
          color: ink.text,
          textShadow: ink.textShadow,
          whiteSpace: "nowrap",
        }}
      >
        {g.team}
      </div>
      <Rule p={p} ink={ink} style={{ marginTop: p.u(g.teamRuleGap) }} />
      {g.sub && (
        <div
          style={{
            ...SANS_BOX,
            marginTop: p.u(g.subGap),
            fontSize: p.u(g.S),
            letterSpacing: `${SMALL_LS}em`,
            marginRight: `-${SMALL_LS}em`,
            color: ink.small,
            textShadow: ink.smallShadow,
            whiteSpace: "nowrap",
          }}
        >
          {g.sub}
        </div>
      )}
    </div>
  );
}

function Jersey({ p, g, ink }: { p: FrontDesignProps; g: ReturnType<typeof layout>; ink: Ink }) {
  if (!p.jersey) return null;
  return (
    <div
      style={abs({
        top: p.u(g.top),
        right: p.u(g.side),
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
      })}
    >
      <div
        style={{
          ...SANS_BOX,
          fontSize: p.u(g.label),
          letterSpacing: `${SMALL_LS}em`,
          marginRight: `-${SMALL_LS}em`,
          color: ink.small,
          textShadow: ink.smallShadow,
          whiteSpace: "nowrap",
        }}
      >
        NO.
      </div>
      <div
        style={{
          ...BEBAS_BOX,
          marginTop: p.u(g.gapLabel),
          fontSize: p.u(g.J),
          letterSpacing: "0.02em",
          marginRight: "-0.02em",
          color: ink.text,
          textShadow: ink.textShadow,
          whiteSpace: "nowrap",
        }}
      >
        {p.jersey}
      </div>
      <Rule p={p} ink={ink} style={{ width: p.u(g.jerseyRuleW), marginTop: p.u(g.gapRule) }} />
    </div>
  );
}

function Name({ p, g, ink }: { p: FrontDesignProps; g: ReturnType<typeof layout>; ink: Ink }) {
  const avail = (p.W - 2 * g.side) * (p.nameItalic ? 0.95 : 1);
  // The name fonts' `em` is an average; wide letters (W, M, O, V) in the
  // wide fonts run ~10% over it, so fit with a margin.
  const em = p.nameFont.em * 1.12;
  const big = (p.landscape ? 13 : 15) * p.nameSize;
  const small = (p.landscape ? 5.8 : 6.6) * p.nameSize;
  const nameBase: CSSProperties = {
    fontFamily: p.nameFont.family,
    fontStyle: p.nameItalic ? "italic" : "normal",
    color: ink.text,
    textShadow: ink.textShadow,
    whiteSpace: "nowrap",
    lineHeight: 0.86,
    textTransform: "uppercase",
  };
  let lines: Array<{ text: string; size: number; ls: number }>;
  if (p.isGroup) {
    const t = (p.nameLines[0] ?? "").trim();
    lines = t ? [{ text: t, size: fitSize(t, (p.landscape ? 9 : 10) * p.nameSize, avail, em, 0.1), ls: 0.1 }] : [];
  } else {
    const [l1, l2] = [0, 1].map((i) => (p.nameLines[i] ?? "").trim());
    lines = [];
    if (l1 && l2) lines.push({ text: l1, size: fitSize(l1, small, avail, em, 0.34), ls: 0.34 });
    const last = l2 || l1;
    if (last) lines.push({ text: last, size: fitSize(last, big, avail, em, 0.06), ls: 0.06 });
  }
  const { head, assistants } = coachLines(p.coaches);
  const coach = [head, assistants].filter((s): s is string => !!s);
  const cAvail = p.W - 2 * g.side;
  if (!lines.length && !coach.length) return null;
  return (
    <div
      style={abs({
        left: p.u(g.side),
        bottom: p.u(g.bottom),
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
      })}
    >
      <Rule p={p} ink={ink} style={{ width: p.u(SHORT_RULE), marginBottom: p.u(2.6) }} />
      {lines.map((l, i) => (
        <div
          key={i}
          style={{
            ...nameBase,
            fontSize: p.u(l.size),
            letterSpacing: `${l.ls}em`,
            marginRight: `-${l.ls}em`,
            marginTop: p.u((i ? 1.2 : 0) + accentLift(l.text, l.size)),
          }}
        >
          {l.text}
        </div>
      ))}
      {coach.map((c, i) => (
        <div
          key={i}
          style={{
            ...SANS_BOX,
            marginTop: p.u(i ? 1.25 : lines.length ? 2.8 : 0),
            fontSize: p.u(fitSize(c, 2.3, cAvail, SANS_EM, 0.26)),
            letterSpacing: "0.26em",
            marginRight: "-0.26em",
            color: ink.small,
            textShadow: ink.smallShadow,
            whiteSpace: "nowrap",
          }}
        >
          {c}
        </div>
      ))}
    </div>
  );
}

// ── Design ───────────────────────────────────────────────────────────────────

export const minimal: FrontDesign = {
  id: "minimal",
  name: "Minimal",
  nameFont: "bebas",
  render: (p) => {
    const g = layout(p);
    const ink = inks(p);
    return (
      <>
        <MinimalTeam p={p} g={g} ink={ink} />
        <Jersey p={p} g={g} ink={ink} />
        <Name p={p} g={g} ink={ink} />
      </>
    );
  },
  // Stamp (≈26u × 6u, right-aligned): under the jersey; with no jersey, at the
  // top right when the team block leaves room, else under the team block.
  circulation: (p) => {
    const g = layout(p);
    const stampW = 26;
    let top: number;
    if (p.jersey) top = g.top + g.jerseyH + 2.6;
    else if (g.side + g.teamW + 3 <= p.W - g.side - stampW) top = g.top;
    else top = g.top + g.teamH + 2.6;
    return { top: p.u(top), right: p.u(g.side) };
  },
};
