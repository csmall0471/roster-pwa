// Scoreboard — TV broadcast graphics. A score bug top-left (a big age cell in
// the secondary color, the team box in the primary color and the season on a
// secondary strip under it), a score box top-right for the jersey number (a
// primary "NO." tab over a secondary square) and a lower-third name bar that
// bleeds off the left edge (primary name box over a secondary strip that
// carries the coaches). Hard rectangles, Anton numbers and names, Geist caps
// labels and thin primary-colored dividers tie the four parts together.

import type { ReactNode } from "react";
import {
  FONTS,
  FONT_EM,
  abs,
  coachLines,
  fitSize,
  shadow,
  teamOrPlaceholder,
  type FrontDesign,
  type FrontDesignProps,
} from "./shared";

// ── Geometry (all in u) ──────────────────────────────────────────────────────

const TOP = 6; // top of the score bug and the score box (unframed)
const BLEED_LEFT = -4; // bleed plates start this far past the left trim
const BLEED_PAD = 9; // left padding on a bleed plate → text starts at 5u
const FRAMED_PAD = 2.2; // left padding on an inset (framed) plate
const RIGHT_MARGIN = 6; // unframed plates end this far inside the right trim
const DIVIDER = 0.6; // thin primary divider between bug cells
const RULE = 0.5; // thin primary underline under the bug, score box and lower third
const JERSEY_GAP = 4; // team block ↔ score box (≥ 3u required)

// Score bug rows.
const TEAM_H = 9.8;
const SEASON_H = 4.6;
const SLIM_H = 1.3; // accent strip when there is no season
const TEAM_PAD_X = 2.4;
const SEASON_PAD_X = 2.4;
const AGE_PAD_R = 2;
const ACCENT_BAR = 7; // no-age accent bar (unframed: −4u → 3u)
const ACCENT_BAR_FRAMED = 1.6;

// Score box: tab + square, same total height as the bug.
const JERSEY_TAB = 3.4;
const JERSEY_SQ = TEAM_H + SEASON_H - JERSEY_TAB;
const JERSEY_W = 12.8;
// Secondary cap on the right end of the name box (mirrors the bug's age cell).
const NAME_CAP = 1.4;
// The lower third runs at least this far right (u) so short names still read
// as a bar.
const NAME_MIN_RIGHT = { portrait: 44, landscape: 54 };

// Letter-spacing (em) used for each kind of text, also fed to fitSize.
const LS_TEAM = 0.04;
const LS_AGE = 0.01;
const LS_LABEL = 0.24;
const LS_NAME = 0.01;
const LS_COACH = 0.14;

function framedOf(p: FrontDesignProps) {
  return !!p.frame;
}
function jerseyText(p: FrontDesignProps) {
  return p.jersey.trim();
}

// Left edge of the left-anchored plates and the padding that keeps their text
// inside the safe line (bleed) or clear of the keyline (framed).
function leftEdge(p: FrontDesignProps) {
  return framedOf(p) ? p.inset + 1 : BLEED_LEFT;
}
function leftPad(p: FrontDesignProps) {
  return framedOf(p) ? FRAMED_PAD : BLEED_PAD;
}
// Furthest right a plate may end.
function maxRight(p: FrontDesignProps) {
  return framedOf(p) ? p.W - p.inset - 1 : p.W - RIGHT_MARGIN;
}

function jerseyGeo(p: FrontDesignProps) {
  const framed = framedOf(p);
  const top = framed ? p.inset + 1.2 : TOP;
  const right = framed ? p.inset + 1.2 : RIGHT_MARGIN;
  const width = JERSEY_W;
  return { top, right, width, left: p.W - right - width, bottom: top + JERSEY_TAB + JERSEY_SQ + RULE };
}

function bugTop(p: FrontDesignProps) {
  return framedOf(p) ? p.inset + 1.2 : TOP;
}

// Broadcast plate: a soft top-down highlight over a solid color (plain CSS
// gradient, so it exports like a flat fill; invisible on white plates).
function sheen(color: string) {
  return `linear-gradient(180deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0) 70%), ${color}`;
}

// fitSize with headroom: FONT_EM is an average, and names heavy in wide
// letters (M, W, X, O…) in wide fonts run ~6% over it.
const FIT_SAFETY = 0.93;
const NAME_FIT_SAFETY = 0.84;
function fit(text: string, base: number, avail: number, em: number, ls: number) {
  return fitSize(text, base, avail * FIT_SAFETY, em, ls);
}

// Estimated width (u) of a single line of text.
function textW(text: string, size: number, em: number, ls: number) {
  return [...text].length * (em + ls) * size;
}

// ── Team: score bug ──────────────────────────────────────────────────────────

function bugLayout(p: FrontDesignProps) {
  const left = leftEdge(p);
  const padL = leftPad(p);
  const age = p.age.trim().toUpperCase();
  const season = p.season.trim().toUpperCase();
  const team = teamOrPlaceholder(p);

  const ageSize = age ? fit(age, 9, 14, FONT_EM.anton, LS_AGE) : 0;
  const ageCell = age
    ? padL + Math.max(textW(age, ageSize, FONT_EM.anton, LS_AGE) / FIT_SAFETY, 5) + AGE_PAD_R
    : framedOf(p)
      ? ACCENT_BAR_FRAMED
      : ACCENT_BAR;
  const colStart = left + ageCell + DIVIDER;
  const colRight = jerseyText(p) ? jerseyGeo(p).left - JERSEY_GAP : maxRight(p);
  const colAvail = colRight - colStart;

  const teamSize = fit(team, 6.4, colAvail - 2 * TEAM_PAD_X, FONT_EM.anton, LS_TEAM);
  const seasonSize = season ? fit(season, 2.3, colAvail - 2 * SEASON_PAD_X, FONT_EM.sans, LS_LABEL) : 0;
  const bottom = bugTop(p) + TEAM_H + (season ? SEASON_H : SLIM_H) + RULE;
  // Estimated rendered width of the team/season column (for the stamp).
  const colW = Math.min(
    colAvail,
    Math.max(
      textW(team, teamSize, FONT_EM.anton, LS_TEAM) / FIT_SAFETY + 2 * TEAM_PAD_X,
      season ? textW(season, seasonSize, FONT_EM.sans, LS_LABEL) / FIT_SAFETY + 2 * SEASON_PAD_X : 0
    )
  );
  return { left, padL, age, season, team, ageSize, ageCell, teamSize, seasonSize, bottom, colRight: colStart + colW };
}

function Team(p: FrontDesignProps) {
  const L = bugLayout(p);
  const { u, palette } = p;
  return (
    <div
      style={abs({
        top: u(bugTop(p)),
        left: u(L.left),
        display: "flex",
        alignItems: "stretch",
        borderBottom: `${u(RULE)} solid ${palette.background}`,
        ...shadow(p, "drop-shadow(0 3px 8px rgba(0,0,0,0.45))"),
      })}
    >
      {/* Age cell (or a slim accent bar), full bug height. */}
      <div
        style={{
          width: u(L.ageCell),
          background: sheen(palette.subBackground),
          color: palette.subColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingLeft: L.age ? u(L.padL) : 0,
          paddingRight: L.age ? u(AGE_PAD_R) : 0,
          boxSizing: "border-box",
          fontFamily: FONTS.anton,
          fontSize: u(L.ageSize || 1),
          letterSpacing: `${LS_AGE}em`,
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        {L.age}
      </div>
      <div style={{ width: u(DIVIDER), background: palette.background }} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch" }}>
        <div
          style={{
            height: u(TEAM_H),
            display: "flex",
            alignItems: "center",
            padding: `0 ${u(TEAM_PAD_X)}`,
            boxSizing: "border-box",
            background: sheen(palette.background),
            color: palette.color,
            fontFamily: FONTS.anton,
            fontSize: u(L.teamSize),
            letterSpacing: `${LS_TEAM}em`,
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          {L.team}
        </div>
        <div
          style={{
            height: u(L.season ? SEASON_H : SLIM_H),
            display: "flex",
            alignItems: "center",
            padding: `0 ${u(SEASON_PAD_X)}`,
            boxSizing: "border-box",
            background: palette.subBackground,
            color: palette.subColor,
            fontFamily: FONTS.sans,
            fontWeight: 700,
            fontSize: u(L.seasonSize || 1),
            letterSpacing: `${LS_LABEL}em`,
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          {L.season}
        </div>
      </div>
    </div>
  );
}

// ── Jersey: score box ────────────────────────────────────────────────────────

function Jersey(p: FrontDesignProps) {
  const num = jerseyText(p);
  if (!num) return null;
  const g = jerseyGeo(p);
  const { u, palette } = p;
  const size = fit(num, 9.4, g.width - 2.6, FONT_EM.anton, 0.02);
  return (
    <div
      style={abs({
        top: u(g.top),
        right: u(g.right),
        width: u(g.width),
        display: "flex",
        flexDirection: "column",
        borderBottom: `${u(RULE)} solid ${palette.background}`,
        ...shadow(p, "drop-shadow(0 3px 8px rgba(0,0,0,0.45))"),
      })}
    >
      <div
        style={{
          height: u(JERSEY_TAB),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: palette.background,
          color: palette.color,
          fontFamily: FONTS.sans,
          fontWeight: 800,
          fontSize: u(1.9),
          letterSpacing: `${LS_LABEL}em`,
          paddingLeft: `${LS_LABEL}em`, // balance the trailing letter-spacing
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        NO.
      </div>
      <div
        style={{
          height: u(JERSEY_SQ),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: sheen(palette.subBackground),
          color: palette.subColor,
          fontFamily: FONTS.anton,
          fontSize: u(size),
          letterSpacing: "0.02em",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        {num}
      </div>
    </div>
  );
}

// ── Name: lower third ────────────────────────────────────────────────────────

function nameText(p: FrontDesignProps) {
  if (p.isGroup) return (p.nameLines[0] ?? "").trim().toUpperCase();
  return p.nameLines
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

function CoachItem({ label, name }: { label: string; name: string }) {
  return (
    <div style={{ display: "flex", gap: "0.5em", whiteSpace: "nowrap" }}>
      <div style={{ opacity: 0.7 }}>{label}</div>
      <div>{name}</div>
    </div>
  );
}

function splitCoach(line: string): { label: string; name: string } {
  const i = line.indexOf(" ");
  return i < 0 ? { label: "", name: line } : { label: line.slice(0, i), name: line.slice(i + 1) };
}

function Name(p: FrontDesignProps) {
  const { u, palette } = p;
  const framed = framedOf(p);
  const left = leftEdge(p);
  const padL = leftPad(p);
  const padR = 3.4 + (p.nameItalic ? 1 : 0);
  const capR = padR + NAME_CAP;
  const name = nameText(p);
  const { head, assistants } = coachLines(p.coaches);
  const coaches = [head, assistants].filter((s): s is string => !!s);
  if (!name && !coaches.length) return null;

  const avail = maxRight(p) - (left + padL) - capR;
  const base = (p.isGroup ? 8 : 11) * p.nameSize;
  // Names heavy in wide letters (M, W, H, A, N) run ~15% over the font's
  // average glyph width, so the name line fits with extra headroom.
  const nameSize = fitSize(name || " ", base, avail * NAME_FIT_SAFETY, p.nameFont.em, LS_NAME);

  // Coaches: head coach over assistants, one size for both lines.
  const stripPadR = 3 + NAME_CAP;
  const stripAvail = maxRight(p) - (left + padL) - stripPadR;
  const coachSize = coaches.length
    ? Math.min(...coaches.map((c) => fit(c, 2.3, stripAvail, FONT_EM.sans, LS_COACH)))
    : 0;

  const bottom = framed ? p.inset + 1.4 : 6.5;
  let strip: ReactNode;
  if (coaches.length) {
    strip = (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: u(0.9),
          padding: `${u(1.2)} ${u(stripPadR)} ${u(1.2)} ${u(padL)}`,
          background: palette.subBackground,
          color: palette.subColor,
          fontFamily: FONTS.sans,
          fontWeight: 700,
          fontSize: u(coachSize),
          letterSpacing: `${LS_COACH}em`,
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        {coaches.map((c) => {
          const it = splitCoach(c);
          return <CoachItem key={c} label={it.label} name={it.name} />;
        })}
      </div>
    );
  } else {
    strip = <div style={{ height: u(SLIM_H), background: palette.subBackground }} />;
  }

  return (
    <div
      style={abs({
        left: u(left),
        bottom: u(bottom),
        minWidth: u((p.landscape ? NAME_MIN_RIGHT.landscape : NAME_MIN_RIGHT.portrait) - left),
        maxWidth: u(maxRight(p) - left),
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        borderBottom: `${u(RULE)} solid ${palette.background}`,
        ...shadow(p, "drop-shadow(0 3px 8px rgba(0,0,0,0.45))"),
      })}
    >
      {name && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: `${u(1.5)} ${u(padR)} ${u(1.3)} ${u(padL)}`,
            borderRight: `${u(NAME_CAP)} solid ${palette.subBackground}`,
            background: sheen(palette.background),
            color: palette.color,
            fontFamily: p.nameFont.family,
            fontStyle: p.nameItalic ? "italic" : "normal",
            fontSize: u(nameSize),
            letterSpacing: `${LS_NAME}em`,
            lineHeight: 1,
            whiteSpace: "nowrap",
            textTransform: p.isGroup ? "uppercase" : undefined,
          }}
        >
          {name}
        </div>
      )}
      {strip}
    </div>
  );
}

// ── Limited-edition stamp ────────────────────────────────────────────────────

// Under the score box when there is a jersey; otherwise top-right if the score
// bug leaves room, else just under the bug.
function circulation(p: FrontDesignProps): { top: string; right: string } {
  const STAMP_W = 26;
  if (jerseyText(p)) {
    const g = jerseyGeo(p);
    return { top: p.u(g.bottom + 1.6), right: p.u(g.right) };
  }
  const L = bugLayout(p);
  const right = framedOf(p) ? p.inset + 1.2 : RIGHT_MARGIN + 1;
  if (L.colRight + 3 <= p.W - right - STAMP_W) return { top: p.u(bugTop(p) + 0.6), right: p.u(right) };
  return { top: p.u(L.bottom + 1.6), right: p.u(right) };
}

export const scoreboard: FrontDesign = {
  id: "scoreboard",
  name: "Scoreboard",
  nameFont: "anton",
  render: (p) => (
    <>
      <Team {...p} />
      <Jersey {...p} />
      <Name {...p} />
    </>
  ),
  circulation,
};
