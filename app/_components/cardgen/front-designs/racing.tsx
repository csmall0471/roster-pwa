// Racing — a motorsport livery. Every piece is a parallelogram leaning forward
// 15° (cut with clip-path, so the text stays upright), and each stack steps
// along one slanted line, as if cut from a single leaning block:
//   - team: primary plate + two trailing speed stripes, age · season on a
//     secondary strip below;
//   - jersey: a secondary number board top-right with a thin primary stripe;
//   - name: first name on a small secondary strip, last name on the big
//     primary plate with speed stripes, bottom-left;
//   - coaches: thin secondary strip(s) under the name plate.
// Without a frame the left-hand plates run fully off the left trim (bleed);
// inside a frame they become inset plates whose slanted corners stay clear of
// the keyline. All geometry is computed in card units so every corner is
// known: a plate of height h runs h·tan15° sideways over its height.

import type { CSSProperties, ReactNode } from "react";
import {
  FONTS,
  FONT_EM,
  abs,
  coachLines,
  coachText,
  fitSize,
  shadow,
  subLine,
  teamOrPlaceholder,
  type CardUnit,
  type FrontDesign,
  type FrontDesignProps,
} from "./shared";

const TAN = Math.tan((15 * Math.PI) / 180); // sideways run per u of height

// Unframed left plates start here (well past the trim) …
const BLEED_X = -4;
// … and their text starts here (≥ SAFE from the trim).
const TEXT_X = 7;
// Clearance between text and a slanted plate end, on top of the slant run.
const PAD = 1.1;
// Horizontal gap (measured at the same height) between the team rows and the
// jersey board — the edges are parallel, so it is the same top to bottom.
const JERSEY_GAP = 3.5;

// Team block.
const TEAM_H = 9;
const TEAM_FONT = 6.6;
const TEAM_LS = 0.04;
const SUB_H = 4.8;
const SUB_FONT = 2.5;
const SUB_LS = 0.22;
const TEAM_GAP = 0.8;

// Jersey number board.
const JERSEY_H = TEAM_H + TEAM_GAP + SUB_H;
const JERSEY_W = 18;
const JERSEY_FONT = 10.5;
const JERSEY_EM = 0.5; // Anton digits (measured)
const JERSEY_STRIPE = 1.3;
const JERSEY_STRIPE_GAP = 0.9;
const JERSEY_KEYLINE = 0.6;

// Name + coaches.
const NAME_FONT = 11;
const GROUP_FONT = 8;
const FIRST_FONT = 6;
const NAME_LS = 0.02;
const ROW_GAP = 0.7;
const COACH_H = 4.2;
const COACH_FONT = 2.3;
const COACH_MIN_SINGLE = 1.95; // below this, split head / assistants onto two strips
const COACH_LS = 0.14;
const COACH_GAP = 0.5;
// Tallest the name + coaches stack may get (u), so it stays below the face.
const NAME_BUDGET = { portrait: 46, landscape: 32 };

// Trailing speed stripes: [gap, thickness, gap, thickness] as fractions of the
// plate height.
const STRIPES = [0.1, 0.2, 0.08, 0.11];
const stripesWidth = (h: number) => STRIPES.reduce((a, b) => a + b, 0) * h;

type Edges = {
  framed: boolean;
  // Card x of the stacks' container: off the card (bleed) or, in a frame, the
  // bottom-left corner of the lowest inset plate.
  base: number;
  top: number; // top of the team row / jersey board
  right: number; // rightmost card x any plate or stripe may reach
  bottom: number; // distance of the name stack from the bottom trim
};

function edges(p: FrontDesignProps): Edges {
  const framed = !!p.frame;
  return {
    framed,
    base: framed ? p.inset + 1.2 : BLEED_X,
    top: framed ? p.inset + 1.6 : 6,
    right: framed ? p.W - p.inset - 1.2 : p.W - 5,
    // Coach strips are thin (text sits ~1u above their bottom edge); the name
    // plate's text sits further in.
    bottom: framed ? p.inset + 1.4 : coachText(p.coaches) ? 4.5 : 5.5,
  };
}

// Card x where a row's text starts. `shift` = how far the row steps right
// along the slanted line (rows higher in a stack step further right).
function textStart(e: Edges, h: number, shift: number) {
  return e.framed ? e.base + shift + h * TAN + PAD : TEXT_X + shift;
}

// Space after the text: the slanted right end, plus stripes if any.
function tail(h: number, stripes: boolean) {
  return h * TAN + PAD + (stripes ? stripesWidth(h) : 0);
}

// FONT_EM is an average over typical text; real names run up to ~25% wider
// (M/W-heavy) or narrower (I, spaces, punctuation). Weighting each character
// keeps long names from pushing a plate's stripes off the card.
function widthFactor(text: string) {
  const chars = [...text];
  if (!chars.length) return 1;
  let sum = 0;
  for (const c of chars) {
    if (c === "M" || c === "W") sum += 1.45;
    else if (c === "I") sum += 0.55;
    else if (c === "J" || c === "1") sum += 0.85;
    else if (c === " ") sum += 0.55;
    else if (".,·'’-".includes(c)) sum += 0.5;
    else sum += 1.1;
  }
  return sum / chars.length;
}

// fitSize with the per-character estimate and a little slack.
function fit(text: string, base: number, avail: number, em: number, ls: number) {
  return fitSize(text, base, avail * 0.97, em * widthFactor(text), ls);
}

function textWidth(text: string, size: number, em: number, ls: number) {
  return [...text].length * (em * widthFactor(text) + ls) * size;
}

// ── Layout ──────────────────────────────────────────────────────────────────

type JerseyLayout = { top: number; right: number; s: number; leftTop: number; size: number };

function jerseyLayout(p: FrontDesignProps, e: Edges): JerseyLayout | null {
  if (!p.jersey) return null;
  const s = JERSEY_H * TAN;
  // Distance from the right trim to the board's top-right corner.
  const right = e.framed ? p.inset + 1.2 : 5;
  const boardLeftTop = p.W - right - JERSEY_W + s;
  return {
    top: e.top,
    right,
    s,
    // Left edge of the stripe at the board's top.
    leftTop: boardLeftTop - JERSEY_STRIPE_GAP - JERSEY_STRIPE,
    size: fitSize(p.jersey, JERSEY_FONT, JERSEY_W - s - 3.2, JERSEY_EM),
  };
}

type Row = {
  mt?: number; // gap above this row in its stack
  text: string;
  h: number;
  size: number;
  shift: number;
  stripes: boolean;
  bg: string;
  color: string;
  font: CSSProperties;
};

function teamLayout(p: FrontDesignProps, e: Edges, j: JerseyLayout | null) {
  const team = teamOrPlaceholder(p).toUpperCase();
  const sub = subLine(p).toUpperCase();
  const teamShift = sub ? (TEAM_GAP + SUB_H) * TAN : 0;
  const teamX = textStart(e, TEAM_H, teamShift);
  const subX = textStart(e, SUB_H, 0);
  // With a jersey, each row's top-right corner stays JERSEY_GAP left of the
  // board's stripe at that row's height.
  const teamLimit = j ? j.leftTop - JERSEY_GAP : e.right;
  const subLimit = j ? j.leftTop - (TEAM_H + TEAM_GAP) * TAN - JERSEY_GAP : e.right;
  const teamSize = fit(team, TEAM_FONT, teamLimit - teamX - tail(TEAM_H, true), FONT_EM.anton, TEAM_LS);
  const subSize = sub ? fit(sub, SUB_FONT, subLimit - subX - tail(SUB_H, false), FONT_EM.sans, SUB_LS) : 0;
  const rows: Row[] = [
    {
      text: team,
      h: TEAM_H,
      size: teamSize,
      shift: teamShift,
      stripes: true,
      bg: p.palette.background,
      color: p.palette.color,
      font: { fontFamily: FONTS.anton, letterSpacing: `${TEAM_LS}em` },
    },
  ];
  if (sub)
    rows.push({
      text: sub,
      h: SUB_H,
      size: subSize,
      shift: 0,
      stripes: false,
      bg: p.palette.subBackground,
      color: p.palette.subColor,
      font: { fontFamily: FONTS.sans, fontWeight: 800, letterSpacing: `${SUB_LS}em` },
    });
  const teamRight = teamX + textWidth(team, teamSize, FONT_EM.anton, TEAM_LS) + tail(TEAM_H, true);
  const subRight = sub ? subX + textWidth(sub, subSize, FONT_EM.sans, SUB_LS) + tail(SUB_H, false) : 0;
  const height = TEAM_H + (sub ? TEAM_GAP + SUB_H : 0);
  return { rows, right: Math.max(teamRight, subRight), height };
}

function nameLayout(p: FrontDesignProps, e: Edges): Row[] {
  const rows: Row[] = []; // bottom-up while building
  let dist = 0; // distance from the stack bottom to the next row's bottom
  const gap = (g: number) => {
    rows[rows.length - 1].mt = g;
    dist += g;
  };
  const avail = (h: number, shift: number, stripes: boolean) => e.right - textStart(e, h, shift) - tail(h, stripes);
  const sec = { bg: p.palette.subBackground, color: p.palette.subColor };
  const pri = { bg: p.palette.background, color: p.palette.color };
  const coachFont: CSSProperties = { fontFamily: FONTS.sans, fontWeight: 700, letterSpacing: `${COACH_LS}em` };

  // Coaches: one strip, or head + assistants on two when one would get tiny.
  const single = coachText(p.coaches);
  if (single) {
    const { head, assistants } = coachLines(p.coaches);
    const one = fit(single, COACH_FONT, avail(COACH_H, 0, false), FONT_EM.sans, COACH_LS);
    const lines = one >= COACH_MIN_SINGLE || !head || !assistants ? [single] : [assistants, head];
    lines.forEach((text, i) => {
      if (i > 0) gap(COACH_GAP);
      const shift = dist * TAN;
      rows.push({
        text,
        h: COACH_H,
        size: fit(text, COACH_FONT, avail(COACH_H, shift, false), FONT_EM.sans, COACH_LS),
        shift,
        stripes: false,
        ...sec,
        font: coachFont,
      });
      dist += COACH_H;
    });
  }

  const nameFont: CSSProperties = {
    fontFamily: p.nameFont.family,
    fontStyle: p.nameItalic ? "italic" : "normal",
    letterSpacing: `${NAME_LS}em`,
  };
  const clean = p.nameLines.map((l) => (l ?? "").trim().toUpperCase());
  let big = "";
  let small = "";
  if (p.isGroup) {
    big = clean.filter(Boolean).join(" ");
  } else if (clean[0] && clean[1]) {
    small = clean[0];
    big = clean[1];
  } else {
    big = clean[0] || clean[1] || "";
  }

  // Scale the user's name size down if the stack would rise into the face.
  let ns = p.nameSize;
  const bigBase = p.isGroup ? GROUP_FONT : NAME_FONT;
  if (big) {
    const fixed = dist + (rows.length ? ROW_GAP : 0) + (small ? ROW_GAP : 0);
    const perNs = bigBase * 1.18 + (small ? FIRST_FONT * 1.25 : 0);
    const budget = p.landscape ? NAME_BUDGET.landscape : NAME_BUDGET.portrait;
    ns = Math.min(ns, (budget - fixed) / perNs);
  }

  if (big) {
    if (rows.length) gap(ROW_GAP);
    const shift = dist * TAN;
    const baseSize = bigBase * ns;
    const size = fit(big, baseSize, avail(baseSize * 1.18, shift, true), p.nameFont.em, NAME_LS);
    const h = size * 1.18;
    rows.push({ text: big, h, size, shift, stripes: true, ...pri, font: nameFont });
    dist += h;
  }
  if (small) {
    gap(ROW_GAP);
    const shift = dist * TAN;
    const base = FIRST_FONT * ns;
    const size = fit(small, base, avail(base * 1.25, shift, false), p.nameFont.em, NAME_LS);
    rows.push({ text: small, h: size * 1.25, size, shift, stripes: false, ...sec, font: nameFont });
  }
  return rows.reverse();
}

// ── Pieces ──────────────────────────────────────────────────────────────────

// A parallelogram of height h leaning forward. `bleed` = square left end (it
// runs off the card); otherwise both ends are slanted.
function Para({
  u,
  h,
  w,
  ml,
  bleed,
  bg,
  style,
  children,
}: {
  u: CardUnit;
  h: number;
  w?: number;
  ml?: number;
  bleed?: boolean;
  bg: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const S = u(h * TAN);
  return (
    <div
      style={{
        flex: "none",
        boxSizing: "border-box",
        height: u(h),
        ...(w != null ? { width: u(w) } : {}),
        ...(ml ? { marginLeft: u(ml) } : {}),
        background: bg,
        clipPath: bleed
          ? `polygon(0 0, 100% 0, calc(100% - ${S}) 100%, 0 100%)`
          : `polygon(${S} 0, 100% 0, calc(100% - ${S}) 100%, 0 100%)`,
        display: "flex",
        alignItems: "center",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// One plate (+ optional trailing stripes) of a stack.
function SlantRow({ p, e, row, mt }: { p: FrontDesignProps; e: Edges; row: Row; mt: number }) {
  const { u } = p;
  const { h } = row;
  const s = h * TAN;
  const padL = textStart(e, h, row.shift) - (e.framed ? e.base + row.shift : BLEED_X);
  const [g1, t1, g2, t2] = STRIPES.map((f) => f * h);
  return (
    <div
      style={{
        display: "flex",
        flex: "none",
        ...(mt ? { marginTop: u(mt) } : {}),
        ...(e.framed && row.shift ? { marginLeft: u(row.shift) } : {}),
      }}
    >
      <Para
        u={u}
        h={h}
        bleed={!e.framed}
        bg={row.bg}
        style={{
          color: row.color,
          paddingLeft: u(padL),
          paddingRight: u(s + PAD),
          fontSize: u(row.size),
          lineHeight: 1,
          whiteSpace: "nowrap",
          ...row.font,
        }}
      >
        {row.text}
      </Para>
      {row.stripes && (
        <>
          <Para u={u} h={h} w={t1 + s} ml={g1 - s} bg={stripeColor(p, 0)} />
          <Para u={u} h={h} w={t2 + s} ml={g2 - s} bg={stripeColor(p, 1)} />
        </>
      )}
    </div>
  );
}

// Stripes sit on the photo: secondary then primary with team colors; with no
// colors picked they follow the card's light/dark text scheme so they read.
function stripeColor(p: FrontDesignProps, i: number) {
  if (p.colorSource === "default") return p.textColor;
  return i === 0 ? p.palette.subBackground : p.palette.background;
}

const SHADOW = "drop-shadow(0 3px 6px rgba(0,0,0,0.45))";

function Team(p: FrontDesignProps) {
  const e = edges(p);
  const { rows } = teamLayout(p, e, jerseyLayout(p, e));
  return (
    <div
      style={abs({
        top: p.u(e.top),
        left: p.u(e.base),
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        ...shadow(p, SHADOW),
      })}
    >
      {rows.map((row, i) => (
        <SlantRow key={i} p={p} e={e} row={row} mt={i ? TEAM_GAP : 0} />
      ))}
    </div>
  );
}

function Jersey(p: FrontDesignProps) {
  const e = edges(p);
  const j = jerseyLayout(p, e);
  if (!j) return null;
  const { u } = p;
  // Inner panel: the board inset by JERSEY_KEYLINE on every side (sideways
  // inset on the slanted ends = d / cos 15°), leaving a primary keyline.
  const d = JERSEY_KEYLINE;
  const k = d / Math.cos((15 * Math.PI) / 180);
  const pt = (x: number, y: number) => `${u(x)} ${u(y)}`;
  const inner = [
    pt(j.s - TAN * d + k, d),
    pt(JERSEY_W - TAN * d - k, d),
    pt(JERSEY_W - j.s + TAN * d - k, JERSEY_H - d),
    pt(TAN * d + k, JERSEY_H - d),
  ].join(", ");
  return (
    <div
      style={abs({
        top: u(j.top),
        right: u(j.right),
        display: "flex",
        ...shadow(p, SHADOW),
      })}
    >
      <Para u={u} h={JERSEY_H} w={JERSEY_STRIPE + j.s} bg={stripeColor(p, 1)} />
      <Para u={u} h={JERSEY_H} w={JERSEY_W} ml={JERSEY_STRIPE_GAP - j.s} bg={p.palette.background} style={{ position: "relative" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            clipPath: `polygon(${inner})`,
            background: p.palette.subBackground,
            color: p.palette.subColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: FONTS.anton,
            fontSize: u(j.size),
            lineHeight: 1,
            letterSpacing: "0.02em",
            whiteSpace: "nowrap",
          }}
        >
          {p.jersey}
        </div>
      </Para>
    </div>
  );
}

function Name(p: FrontDesignProps) {
  const e = edges(p);
  const rows = nameLayout(p, e);
  if (!rows.length) return null;
  return (
    <div
      style={abs({
        bottom: p.u(e.bottom),
        left: p.u(e.base),
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        ...shadow(p, SHADOW),
      })}
    >
      {rows.map((row, i) => (
        <SlantRow key={i} p={p} e={e} row={row} mt={row.mt ?? 0} />
      ))}
    </div>
  );
}

// "LIMITED EDITION n / N" (≈26u × 6u, right-aligned): under the number board,
// lined up with its slanted right edge; with no jersey, top-right unless the
// team rows reach that far, then below them.
function circulation(p: FrontDesignProps): { top: string; right: string } {
  const e = edges(p);
  const j = jerseyLayout(p, e);
  let top: number;
  let right: number;
  if (j) {
    top = j.top + JERSEY_H + 2;
    right = j.right + j.s + 0.6;
  } else {
    right = e.framed ? p.inset + 2 : 7;
    const t = teamLayout(p, e, null);
    top = t.right <= p.W - right - 26 - 3 ? e.top + 1 : e.top + t.height + 2;
  }
  return { top: `${(top / p.H) * 100}%`, right: `${(right / p.W) * 100}%` };
}

export const racing: FrontDesign = {
  id: "racing",
  name: "Racing",
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
