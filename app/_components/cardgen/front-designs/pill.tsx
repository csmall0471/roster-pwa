// Pill — a modern, app-style front: every element is a fully rounded capsule
// inset from the trim (nothing bleeds). The team name sits in a big primary
// capsule with a small secondary capsule (age · season) tucked under it; the
// jersey is a primary disc with a secondary ring; the player name mirrors the
// team block at the bottom (first name in a small secondary capsule tucked
// over a big primary capsule) and the coaches ride underneath as small
// translucent chips. Secondary capsules wear a thin primary ring, the jersey a
// secondary ring — the same two-tone language everywhere — and every block
// shares one left edge.

import type { CSSProperties } from "react";
import {
  FONTS,
  FONT_EM,
  abs,
  coachLines,
  fitSize,
  shadow,
  subLine,
  teamOrPlaceholder,
  type FrontDesign,
  type FrontDesignProps,
} from "./shared";

const ROUND = "999px";

// Capsule padding, in em of the capsule's own font size.
const TEAM_PAD = { top: 0.33, bottom: 0.27, x: 0.78 };
const SUB_PAD = { y: 0.55, x: 1.05 };
const BIG_PAD = { top: 0.21, bottom: 0.17, x: 0.46 };
const SMALL_PAD = { top: 0.3, bottom: 0.24, x: 0.62 };
const COACH_PAD = { y: 0.55, x: 0.95 };

// Letter-spacing (em) per piece.
const TEAM_LS = 0.02;
const SUB_LS = 0.2;
const NAME_LS = 0.01;
const COACH_LS = 0.12;

// Gap between stacked capsules (u), the secondary capsule's indent (u), how far
// a secondary capsule tucks over its primary capsule (u), and the primary-color
// ring around secondary capsules (u) that keeps them readable on any photo.
const GAP = 0.9;
const INDENT = 2.4;
const TUCK = 1.3;
const RING = 0.45;
// FONT_EM is an average; real names full of W/M/O/V/K run up to ~13% wider
// (measured). Fit against a wider estimate so a long name never reaches the
// trim or the jersey.
const WIDE_NAME = 1.15; // player names (any user font)
const WIDE = 1.1; // team (Archivo), age · season and coaches (Geist)
// The first name never outgrows this share of the last name.
const SMALL_MAX = 0.62;
// Minimum clearance (u) between the team block and the jersey disc.
const JERSEY_CLEAR = 3.4;

// fitSize for text inside a capsule with `padEm` horizontal padding per side:
// the padding is spread over the characters as extra letter-spacing so the
// whole capsule (not just the text) fits in `avail`.
function fitCapsule(text: string, base: number, avail: number, em: number, ls: number, padEm: number): number {
  const n = Math.max(1, [...text].length);
  return fitSize(text, base, avail, em, ls + (2 * padEm) / n);
}

// Every top-zone size and position, in u — shared by render() and circulation().
function layout(p: FrontDesignProps) {
  const L = p.landscape;
  // Plate margin from each trim edge: well inside the 2.5u trim allowance, and
  // clear of the frame band + keyline when a frame is on.
  const m = p.frame ? p.inset + 1.6 : 6;

  // Jersey disc, top-right.
  const hasJersey = !!p.jersey;
  const D = L ? 14.5 : 15.5;
  const ring = L ? 1.05 : 1.15;
  const jerseyLeft = p.W - m - D;
  const jerseyFs = fitSize(p.jersey || "0", L ? 6.6 : 7.1, (D - 2 * ring) * 0.76, FONT_EM.archivo, 0);

  // Team block, top-left; its right edge stops JERSEY_CLEAR short of the disc.
  const team = teamOrPlaceholder(p);
  const sub = subLine(p).toUpperCase();
  const teamRight = hasJersey ? jerseyLeft - JERSEY_CLEAR : p.W - m;
  const teamAvail = teamRight - m;
  const teamFs = fitCapsule(team, L ? 5.3 : 5.6, teamAvail, FONT_EM.archivo * WIDE, TEAM_LS, TEAM_PAD.x);
  const subFs = fitCapsule(sub, L ? 2.4 : 2.5, teamAvail - INDENT - 2 * RING, FONT_EM.sans * WIDE, SUB_LS, SUB_PAD.x);
  const teamH = teamFs * (1 + TEAM_PAD.top + TEAM_PAD.bottom);
  const subH = sub ? subFs * (1 + 2 * SUB_PAD.y) + 2 * RING : 0;
  const blockH = teamH + (sub ? subH - TUCK : 0);
  // The block centres vertically on the disc (it is never taller than it).
  const teamTop = hasJersey && blockH < D ? m + (D - blockH) / 2 : m;
  const teamBottom = teamTop + blockH;
  const jerseyBottom = hasJersey ? m + D : 0;

  return { m, hasJersey, D, ring, jerseyFs, team, sub, teamFs, subFs, teamTop, teamBottom, jerseyBottom };
}

type Layout = ReturnType<typeof layout>;

// Secondary capsule: secondary fill, thin primary ring, painted over the
// primary capsule it tucks into.
function secondary(p: FrontDesignProps): CSSProperties {
  return {
    position: "relative",
    zIndex: 1,
    background: p.palette.subBackground,
    color: p.palette.subColor,
    border: `${p.u(RING)} solid ${p.palette.background}`,
    borderRadius: ROUND,
    marginLeft: p.u(INDENT),
  };
}

function Jersey({ p, g }: { p: FrontDesignProps; g: Layout }) {
  if (!g.hasJersey) return null;
  return (
    <div
      style={abs({
        top: p.u(g.m),
        right: p.u(g.m),
        width: p.u(g.D),
        height: p.u(g.D),
        boxSizing: "border-box",
        borderRadius: ROUND,
        background: p.palette.background,
        // Ring as a border: box-shadow on a round element exports as a square.
        border: `${p.u(g.ring)} solid ${p.palette.subBackground}`,
        color: p.palette.color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONTS.archivo,
        fontSize: p.u(g.jerseyFs),
        letterSpacing: "-0.01em",
        lineHeight: 1,
        paddingTop: "0.05em",
        whiteSpace: "nowrap",
        ...shadow(p, "drop-shadow(0 3px 7px rgba(0,0,0,0.38))"),
      })}
    >
      {p.jersey}
    </div>
  );
}

function Team({ p, g }: { p: FrontDesignProps; g: Layout }) {
  return (
    <div
      style={abs({
        top: p.u(g.teamTop),
        left: p.u(g.m),
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        ...shadow(p, "drop-shadow(0 3px 7px rgba(0,0,0,0.35))"),
      })}
    >
      <div
        style={{
          background: p.palette.background,
          color: p.palette.color,
          borderRadius: ROUND,
          padding: `${TEAM_PAD.top}em ${TEAM_PAD.x}em ${TEAM_PAD.bottom}em`,
          fontFamily: FONTS.archivo,
          fontSize: p.u(g.teamFs),
          letterSpacing: `${TEAM_LS}em`,
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        {g.team}
      </div>
      {g.sub && (
        <div
          style={{
            ...secondary(p),
            marginTop: p.u(-TUCK),
            padding: `${SUB_PAD.y}em ${SUB_PAD.x}em`,
            fontFamily: FONTS.sans,
            fontWeight: 700,
            fontSize: p.u(g.subFs),
            letterSpacing: `${SUB_LS}em`,
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          {g.sub}
        </div>
      )}
    </div>
  );
}

// A coach chip: the "COACH" / "ASST." prefix is dimmed so the names lead.
function CoachChip({ p, text, fs }: { p: FrontDesignProps; text: string; fs: number }) {
  const cut = text.indexOf(" ");
  const label = cut > 0 ? text.slice(0, cut) : "";
  const rest = cut > 0 ? text.slice(cut) : text;
  return (
    <div
      style={{
        background: "rgba(10,10,10,0.66)",
        color: "#ffffff",
        borderRadius: ROUND,
        padding: `${COACH_PAD.y}em ${COACH_PAD.x}em`,
        fontFamily: FONTS.sans,
        fontStyle: "normal",
        fontWeight: 700,
        fontSize: p.u(fs),
        letterSpacing: `${COACH_LS}em`,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {label && <span style={{ opacity: 0.62 }}>{label}</span>}
      {rest}
    </div>
  );
}

function Name({ p, g }: { p: FrontDesignProps; g: Layout }) {
  const L = p.landscape;
  const avail = p.W - 2 * g.m;

  // Big capsule = last name (or the group line); small capsule = first name.
  let small = "";
  let big = "";
  if (p.isGroup) {
    big = (p.nameLines[0] ?? "").toUpperCase();
  } else {
    small = p.nameLines[0] ?? "";
    big = p.nameLines[1] ?? "";
    if (!big) [big, small] = [small, ""];
  }

  // Italic leans right: give the capsule a little more room on that side.
  const lean = p.nameItalic ? 0.1 : 0;
  const em = p.nameFont.em * WIDE_NAME;
  const bigBase = (p.isGroup ? (L ? 7 : 7.6) : L ? 8.6 : 10) * p.nameSize;
  const smallBase = (L ? 4.8 : 5.2) * p.nameSize;
  const bigFs = fitCapsule(big, bigBase, avail, em, NAME_LS, BIG_PAD.x + lean / 2);
  const smallFs = Math.min(
    fitCapsule(small, smallBase, avail - INDENT - 2 * RING, em, NAME_LS, SMALL_PAD.x + lean / 2),
    Math.max(2.4, Math.round(bigFs * SMALL_MAX * 100) / 100)
  );

  // Coaches: one row of chips when it fits at a readable size, else stacked.
  const { head, assistants } = coachLines(p.coaches);
  const chips = [head, assistants].filter((c): c is string => !!c);
  const coachBase = L ? 2.4 : 2.5;
  const all = chips.join("");
  const rowFs = chips.length
    ? fitSize(
        all,
        coachBase,
        avail - GAP * (chips.length - 1),
        FONT_EM.sans * WIDE,
        COACH_LS + (2 * chips.length * COACH_PAD.x) / Math.max(1, [...all].length)
      )
    : 0;
  const row = chips.length < 2 || rowFs >= 2.2;

  const nameType = (fs: number): CSSProperties => ({
    fontFamily: p.nameFont.family,
    fontStyle: p.nameItalic ? "italic" : "normal",
    fontSize: p.u(fs),
    letterSpacing: `${NAME_LS}em`,
    lineHeight: 1,
    whiteSpace: "nowrap",
  });

  if (!big && !chips.length) return null;
  return (
    <div
      style={abs({
        left: p.u(g.m),
        bottom: p.u(g.m),
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        ...shadow(p, "drop-shadow(0 3px 8px rgba(0,0,0,0.38))"),
      })}
    >
      {small && (
        <div
          style={{
            ...secondary(p),
            ...nameType(smallFs),
            marginBottom: big ? p.u(-TUCK) : 0,
            padding: `${SMALL_PAD.top}em ${SMALL_PAD.x + lean}em ${SMALL_PAD.bottom}em ${SMALL_PAD.x}em`,
          }}
        >
          {small}
        </div>
      )}
      {big && (
        <div
          style={{
            ...nameType(bigFs),
            background: p.palette.background,
            color: p.palette.color,
            borderRadius: ROUND,
            padding: `${BIG_PAD.top}em ${BIG_PAD.x + lean}em ${BIG_PAD.bottom}em ${BIG_PAD.x}em`,
          }}
        >
          {big}
        </div>
      )}
      {chips.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: row ? "row" : "column",
            alignItems: "flex-start",
            gap: p.u(row ? GAP : 0.7),
            marginTop: p.u(1.3),
          }}
        >
          {chips.map((c) => (
            <CoachChip
              key={c}
              p={p}
              text={c}
              fs={row ? rowFs : fitCapsule(c, coachBase, avail, FONT_EM.sans * WIDE, COACH_LS, COACH_PAD.x)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export const pill: FrontDesign = {
  id: "pill",
  name: "Pill",
  nameFont: "archivo-black",
  render: (p) => {
    const g = layout(p);
    return (
      <>
        <Jersey p={p} g={g} />
        <Team p={p} g={g} />
        <Name p={p} g={g} />
      </>
    );
  },
  // The stamp sits right-aligned with the disc, below both the disc and the
  // team block, so it can never touch either.
  circulation: (p) => {
    const g = layout(p);
    const top = Math.max(g.jerseyBottom, g.teamBottom) + 2.4;
    return { top: `${+((top / p.H) * 100).toFixed(3)}%`, right: `${+((g.m / p.W) * 100).toFixed(3)}%` };
  },
};
