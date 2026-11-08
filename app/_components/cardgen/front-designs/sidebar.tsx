// Sidebar — a 1990s trading-card front built as one L-shaped frame.
//
// A primary-color bar runs up the left edge and turns the corner into a
// full-width name band along the bottom; a thin secondary pinstripe traces the
// L's inner edge. The team name reads bottom-to-top inside the bar, starting at
// the corner, and the pinstripe swells into a tab carrying AGE · SEASON beside
// it. The player name (small first, big last, one line) and the coaches sit in
// the band. The jersey number hangs from the top edge at top-right on a square
// tab with the same pinstripe along its bottom.
//
// Without a frame the bar and band bleed off the left, top, right and bottom
// trim; inside a frame they become an inset L that stays clear of the keyline.
// Every position is computed in u (see geo()), shared by render() and
// circulation(), so the layout is identical at every preview size.

import type { CSSProperties } from "react";
import {
  accentLift,
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

// ── Geometry (all in u) ──────────────────────────────────────────────────────

const BLEED = 4; // how far a bleeding plate runs past the trim
const K = 1.3; // secondary pinstripe thickness
const FRAME_GAP = 1.4; // framed: clear space between the keyline and the plates
// Anton caps sit centered in the line box: [0.065, 0.925] em at line-height 1
// (measured; the other name fonts are centered the same way to within 0.05em).
const CAP_TOP = 0.065;
const CAP_H = 0.86;

const TEAM_LS = 0.06;
const SUB_LS = 0.2;
const SUB_F = 2.3;
const TAB_T = 4.8; // age · season tab thickness
const TAB_CUT = 3.4; // angled end of the tab
const NAME_LS = 0.02;
const FIRST_RATIO = 0.6; // first-name size vs. last name on the one-line name
const NAME_GAP_EM = 0.28; // space between first and last name
const COACH_LS = 0.14;
const COACH_F = 2.25;
const COACH_MIN = 2; // below this a long single coach line splits in two
const COACH_LH = 1.25;
const DIGIT_EM = 0.5; // Anton digit advance (0.494) + a little tracking
// FONT_EM is an average; real names with wide letters (KOWALCZYK, VANDERHOOVEN)
// measure up to ~1.13× it, so fits use a margin.
// Real names heavy in M/W/H/A run up to ~1.2× the average glyph width.
const NAME_SAFETY = 1.22;
const TEXT_SAFETY = 1.07;

function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// The 90s touch shared by the team name, player name and jersey number: a hard
// offset shadow in the secondary color — only when that color reads against
// both the text and the plate (it would just smear same-colored text).
// `rotated` = text turned -90°: its local axes are turned too, so the offset is
// flipped to keep the shadow falling down-right on the card like the others.
function pop(p: FrontDesignProps, em = 0.055, rotated = false): string | undefined {
  const { color, background, subBackground } = p.palette;
  if (contrast(subBackground, color) < 1.4 || contrast(subBackground, background) < 1.25) return undefined;
  return `${rotated ? -em : em}em ${em}em 0 ${subBackground}`;
}

function fit(text: string, base: number, avail: number, em: number, ls: number, safety = TEXT_SAFETY) {
  return fitSize(text, base, avail, em * safety, ls);
}

type NameLayout =
  | { kind: "row"; first: string; last: string; f: number }
  | { kind: "stack"; first: string; last: string; f1: number; f2: number }
  | { kind: "single"; text: string; f: number };

function nameLayout(p: FrontDesignProps, avail: number): { layout: NameLayout; height: number } {
  const em = p.nameFont.em * NAME_SAFETY;
  const base = (p.isGroup ? 9 : 11) * p.nameSize;
  // Synthesized italics lean right past the advance width.
  const w = avail - (p.nameItalic ? 0.18 * base : 0);
  const first = (p.nameLines[0] ?? "").trim().toUpperCase();
  const last = (p.nameLines[1] ?? "").trim().toUpperCase();
  if (p.isGroup || !first || !last) {
    const text = p.isGroup ? first : first || last;
    const f = fitSize(text || " ", base, w, em, NAME_LS);
    return { layout: { kind: "single", text, f }, height: f };
  }
  const needEm = ([...first].length * FIRST_RATIO + [...last].length) * (em + NAME_LS) + NAME_GAP_EM;
  const f = Math.round(Math.min(base, w / needEm) * 100) / 100;
  // Landscape has little height to spare, so it keeps one line longer.
  if (f >= base * (p.landscape ? 0.6 : 0.8)) return { layout: { kind: "row", first, last, f }, height: f };
  // Too long for one line at a good size: small first name over the last,
  // capped in height so the band stays a band.
  const maxH = p.landscape ? 18 : 26;
  let f2 = fitSize(last, base, w, em, NAME_LS);
  let f1 = fitSize(first, f2 * 0.62, w, em, NAME_LS);
  const k = Math.min(1, maxH / ((f1 + f2) * 0.96 + accentLift(last, f2)));
  f2 = Math.round(f2 * k * 100) / 100;
  f1 = Math.round(f1 * k * 100) / 100;
  return { layout: { kind: "stack", first, last, f1, f2 }, height: (f1 + f2) * 0.96 + accentLift(last, f2) };
}

function coachRows(p: FrontDesignProps, avail: number): { text: string; f: number }[] {
  const one = coachText(p.coaches);
  if (!one) return [];
  const f = fit(one, COACH_F, avail, FONT_EM.sans, COACH_LS);
  const { head, assistants } = coachLines(p.coaches);
  if (f >= COACH_MIN || !head || !assistants) return [{ text: one, f }];
  const f2 = Math.min(
    fit(head, COACH_F, avail, FONT_EM.sans, COACH_LS),
    fit(assistants, COACH_F, avail, FONT_EM.sans, COACH_LS)
  );
  return [
    { text: head, f: f2 },
    { text: assistants, f: f2 },
  ];
}

function jerseyGeo(p: FrontDesignProps) {
  const framed = !!p.frame;
  const edgeIn = p.inset + FRAME_GAP;
  const w = framed ? 14 : 15;
  // Tab's right edge from the right trim: in a frame it lines up with the L.
  const right = framed ? edgeIn : 7;
  const top = framed ? edgeIn : -BLEED;
  const fBase = framed ? 7.4 : 8;
  const capTop = framed ? edgeIn + 2.3 : SAFE + 0.6;
  const bottom = capTop + CAP_H * fBase + 2.3 + K;
  const n = Math.max(1, [...p.jersey].length);
  const f = Math.round(Math.min(fBase, (w - 3.2) / (n * DIGIT_EM + 0.3)) * 100) / 100;
  // Keep the number's caps centered in the same space when it shrinks.
  const numTop = capTop + (CAP_H * (fBase - f)) / 2 - CAP_TOP * f;
  return { w, right, top, bottom, f, numTop };
}

function geo(p: FrontDesignProps) {
  const framed = !!p.frame;
  const edgeIn = p.inset + FRAME_GAP; // framed plates stop here, clear of the keyline
  const out = framed ? edgeIn : -BLEED; // plate edge offset from every trim

  // Bottom band: name (+ coaches) stacked up from the bottom safe line.
  const nameX = framed ? edgeIn + 2.4 : SAFE + 1;
  const nameW = p.W - 2 * nameX;
  const { layout, height: nameH } = nameLayout(p, nameW);
  const coaches = coachRows(p, nameW);
  const coachH = coaches.reduce((s, c) => s + c.f * COACH_LH, 0);
  const contentBottom = framed ? p.H - edgeIn - 2.4 : p.H - SAFE - 0.5;
  const coachTop = contentBottom - coachH;
  const nameTop = coaches.length ? coachTop - 1.3 - nameH : contentBottom - nameH;
  const bandTop = nameTop - 3.4;

  // Left bar: the team name's caps centered in a fixed-width column.
  const teamBase = framed ? 6.2 : 6.8;
  const capOuter = framed ? edgeIn + 2 : SAFE + 0.6;
  const colC = capOuter + (CAP_H * teamBase) / 2;
  const sideR = capOuter + CAP_H * teamBase + (framed ? 2 : 2.4);
  // Team text starts ≥3u above the band (and its pinstripe), reads upward.
  const startY = bandTop - K - 3;
  const topLimit = framed ? edgeIn + 2.2 : SAFE + 1;
  const team = teamOrPlaceholder(p).toUpperCase();
  const teamF = fit(team, teamBase, startY - topLimit, FONT_EM.anton, TEAM_LS);
  const teamX0 = colC - (CAP_TOP + CAP_H / 2) * teamF;

  // Age · season tab growing out of the inner corner.
  const sub = subLine(p).toUpperCase();
  const tabBottom = bandTop - K / 2; // overlaps the horizontal pinstripe
  const tabStartPad = tabBottom - startY;
  const tabEndPad = 1.6 + TAB_CUT;
  const subF = fit(sub || " ", SUB_F, startY - topLimit - tabEndPad, FONT_EM.sans, SUB_LS);

  return {
    framed,
    out,
    nameX,
    layout,
    coaches,
    coachTop,
    nameTop,
    bandTop,
    sideR,
    startY,
    team,
    teamF,
    teamX0,
    sub,
    subF,
    tabBottom,
    tabStartPad,
    tabEndPad,
  };
}

// ── Pieces ───────────────────────────────────────────────────────────────────

// Lifts the plates off the photo; tighter inside a frame so it doesn't smudge
// the keyline.
function plateShadow(p: FrontDesignProps) {
  return p.frame ? "drop-shadow(0 1px 3px rgba(0,0,0,0.35))" : "drop-shadow(0 2px 7px rgba(0,0,0,0.38))";
}

// Built horizontally, then turned -90° about its bottom-left corner and pulled
// down by its own height: the box's top edge becomes its left side, its start
// sits at `bottom` and it grows upward (text reads bottom-to-top).
function vertical(left: number, bottomY: number, p: FrontDesignProps): CSSProperties {
  return abs({
    left: p.u(left),
    bottom: p.u(p.H - bottomY),
    width: "max-content",
    transform: "rotate(-90deg) translateY(100%)",
    transformOrigin: "left bottom",
    whiteSpace: "nowrap",
  });
}

function Frame(p: FrontDesignProps) {
  const g = geo(p);
  const { u, palette } = p;
  const o = u(g.out);
  return (
    <div style={abs({ inset: 0, ...shadow(p, plateShadow(p)) })}>
      {/* Secondary pinstripe along the inner edge of the L (under the plates). */}
      <div
        style={abs({
          left: u(g.sideR - 0.5),
          top: o,
          width: u(K + 0.5),
          height: u(g.bandTop - g.out),
          background: palette.subBackground,
        })}
      />
      <div
        style={abs({
          left: u(g.sideR - 0.5),
          right: o,
          top: u(g.bandTop - K),
          height: u(K + 0.5),
          background: palette.subBackground,
        })}
      />
      {g.sub && (
        <div
          style={{
            ...vertical(g.sideR, g.tabBottom, p),
            height: u(TAB_T),
            boxSizing: "border-box",
            paddingLeft: u(g.tabStartPad),
            paddingRight: u(g.tabEndPad),
            display: "flex",
            alignItems: "center",
            background: palette.subBackground,
            color: palette.subColor,
            clipPath: `polygon(0 0, 100% 0, calc(100% - ${u(TAB_CUT)}) 100%, 0 100%)`,
            fontFamily: FONTS.sans,
            fontWeight: 700,
            fontSize: u(g.subF),
            letterSpacing: `${SUB_LS}em`,
            lineHeight: 1,
          }}
        >
          {g.sub}
        </div>
      )}
      {/* Primary L: left bar + bottom band (overlapping, so no seam). */}
      <div style={abs({ left: o, top: o, bottom: o, width: u(g.sideR - g.out), background: palette.background })} />
      <div style={abs({ left: o, right: o, bottom: o, top: u(g.bandTop), background: palette.background })} />

      {/* Team name up the bar. */}
      <div
        style={{
          ...vertical(g.teamX0, g.startY, p),
          color: palette.color,
          fontFamily: FONTS.anton,
          fontWeight: 400,
          fontSize: u(g.teamF),
          letterSpacing: `${TEAM_LS}em`,
          lineHeight: 1,
          textShadow: pop(p, 0.06, true),
        }}
      >
        {g.team}
      </div>

      <Name p={p} g={g} />

      {g.coaches.length > 0 && (
        <div
          style={abs({
            left: u(g.nameX),
            top: u(g.coachTop),
            display: "flex",
            flexDirection: "column",
            color: palette.color,
            opacity: 0.88,
            fontFamily: FONTS.sans,
            fontWeight: 700,
            lineHeight: COACH_LH,
            whiteSpace: "pre",
          })}
        >
          {g.coaches.map((c) => (
            // letter-spacing in em must sit where the font size is set.
            <div key={c.text} style={{ fontSize: u(c.f), letterSpacing: `${COACH_LS}em` }}>
              {c.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Name({ p, g }: { p: FrontDesignProps; g: ReturnType<typeof geo> }) {
  const { u } = p;
  const L = g.layout;
  const base: CSSProperties = abs({
    left: u(g.nameX),
    top: u(g.nameTop),
    color: p.palette.color,
    fontFamily: p.nameFont.family,
    fontStyle: p.nameItalic ? "italic" : "normal",
    whiteSpace: "nowrap",
  });
  const ls = `${NAME_LS}em`;
  const ts = pop(p);
  if (L.kind === "single") {
    return <div style={{ ...base, fontSize: u(L.f), lineHeight: 1, letterSpacing: ls, textShadow: ts }}>{L.text}</div>;
  }
  if (L.kind === "row") {
    return (
      <div style={{ ...base, display: "flex", alignItems: "baseline", columnGap: `${NAME_GAP_EM}em`, fontSize: u(L.f) }}>
        <div style={{ fontSize: `${FIRST_RATIO}em`, lineHeight: 1, letterSpacing: ls, textShadow: ts }}>{L.first}</div>
        <div style={{ lineHeight: 1, letterSpacing: ls, textShadow: ts }}>{L.last}</div>
      </div>
    );
  }
  return (
    <div style={{ ...base, display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: u(L.f1), lineHeight: 0.96, letterSpacing: ls, textShadow: ts }}>{L.first}</div>
      <div style={{ fontSize: u(L.f2), lineHeight: 0.96, letterSpacing: ls, textShadow: ts, marginTop: u(accentLift(L.last, L.f2)) }}>
        {L.last}
      </div>
    </div>
  );
}

function Jersey(p: FrontDesignProps) {
  if (!p.jersey) return null;
  const j = jerseyGeo(p);
  const { u, palette } = p;
  return (
    <div
      style={abs({
        top: u(j.top),
        right: u(j.right),
        width: u(j.w),
        height: u(j.bottom - j.top),
        boxSizing: "border-box",
        background: palette.background,
        borderBottom: `${u(K)} solid ${palette.subBackground}`,
        ...shadow(p, plateShadow(p)),
      })}
    >
      <div
        style={abs({
          left: 0,
          right: 0,
          top: u(j.numTop - j.top),
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          color: palette.color,
          fontFamily: FONTS.anton,
          fontWeight: 400,
          fontSize: u(j.f),
          lineHeight: 1,
          letterSpacing: "0.02em",
          whiteSpace: "nowrap",
          textShadow: pop(p, 0.06),
        })}
      >
        <div style={{ fontSize: "0.46em", lineHeight: 1, marginTop: "0.12em", marginRight: "0.04em" }}>#</div>
        <div style={{ lineHeight: 1 }}>{p.jersey}</div>
      </div>
    </div>
  );
}

export const sidebar: FrontDesign = {
  id: "sidebar",
  name: "Sidebar",
  nameFont: "anton",
  render: (p) => (
    <>
      <Frame {...p} />
      <Jersey {...p} />
    </>
  ),
  // The stamp tucks under the jersey tab, right-aligned with it.
  circulation: (p) => {
    if (p.jersey) {
      const j = jerseyGeo(p);
      return { top: p.u(j.bottom + 2.2), right: p.u(j.right) };
    }
    return p.frame
      ? { top: p.u(p.inset + 2.2), right: p.u(p.inset + 2.5) }
      : { top: p.u(SAFE + 1.5), right: p.u(7) };
  },
};
