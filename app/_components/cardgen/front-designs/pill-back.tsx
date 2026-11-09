// Pill back — the front's capsule language carried over. The header is the
// front's own team block (primary team capsule, secondary age · season capsule
// tucked under it) and the headshot wears the jersey disc's two-tone ring
// (primary inner ring, secondary outer ring). The content sits on a dark,
// round-cornered glass panel (like the front's coach chips) so its text reads
// over any background; team colors only ever appear as FILLS there (capsules,
// discs, marks), each paired with its contrast text:
//   - primary capsules with a thin secondary ring: stat chips, jersey disc and
//     the big match capsule (the photo nests in its round end);
//   - secondary capsules with a thin primary ring: section labels and the
//     match label, like the front's age · season capsule;
//   - the brighter team color ("pop"): the quote disc, Q&A marks and the
//     coach tags inside translucent coach chips (the front's coach chips).

import type { CSSProperties, ReactNode } from "react";
import {
  FONTS,
  FONT_EM,
  abs,
  accentLift,
  backNameFamily,
  fitSize,
  luminance,
  shadow,
  type BackMatchParts,
  type BackTheme,
  type BackThemeProps,
} from "./shared";
import { PillTeam, teamBlock } from "./pill";

const ROUND = "999px";

// The panel: near-black glass, nearly opaque so white text reads on light and
// dark backgrounds alike.
const PANEL = "linear-gradient(180deg, rgba(26,27,31,0.88) 0%, rgba(10,10,12,0.9) 100%)";
const TEXT = "#ffffff";
const SOFT = "rgba(255,255,255,0.9)";
const DIM = "rgba(255,255,255,0.58)";
const RULE = "rgba(255,255,255,0.14)";

// Header geometry (u): the team block's left margin (the front's), its gap to
// the headshot, and the headshot's secondary outer ring (the jersey disc's).
const M = 6;
const HEADSHOT_CLEAR = 3;
const OUTER_RING = (p: BackThemeProps) => (p.landscape ? 1.05 : 1.15);
// Thin ring around primary capsules on the panel (u) — it outlines a dark
// primary (navy, black) that would otherwise sink into the panel.
const CAP_RING = 0.35;
// Ring around secondary capsules (u), as on the front's age · season capsule.
const SUB_RING = 0.3;
// Stat capsule: side padding and the gap between label and value (u).
const STAT_PAD_X = 1.2;
const STAT_GAP = 0.8;
// Panel font size (u): the layout's em gaps (Q&A grid, coaches, duo photos)
// scale with it, so they are the same at every preview size.
const PANEL_EM = 1.9;

// Content widths (u) inside the layout's panels, for fitting single-line text.
function contentWidth(p: BackThemeProps) {
  if (p.variant === "duo") return p.landscape ? 112 : 80;
  // Solo landscape: the right column (match) of a 120.4u-wide content box.
  return p.landscape ? 72.9 : 82;
}

// The team color that stands out most on the dark panel (the lighter one), with
// its contrast text; white when both are too dark to show.
function pop(p: BackThemeProps): { bg: string; fg: string } {
  const { background, color, subBackground, subColor } = p.palette;
  const [bg, fg] = luminance(background) >= luminance(subBackground) ? [background, color] : [subBackground, subColor];
  return luminance(bg) < 0.03 ? { bg: "#ffffff", fg: "#0a0a0a" } : { bg, fg };
}

function primaryCapsule(p: BackThemeProps): CSSProperties {
  return {
    background: p.palette.background,
    color: p.palette.color,
    border: `${p.u(CAP_RING)} solid ${p.palette.subBackground}`,
    borderRadius: ROUND,
  };
}

function secondaryCapsule(p: BackThemeProps): CSSProperties {
  return {
    background: p.palette.subBackground,
    color: p.palette.subColor,
    border: `${p.u(SUB_RING)} solid ${p.palette.background}`,
    borderRadius: ROUND,
  };
}

// Small spaced caps in a secondary capsule (section labels, match label).
// Trailing letter-spacing sits on the right, so the right padding is smaller.
function Tag({ p, text, fs, style }: { p: BackThemeProps; text: string; fs: number; style?: CSSProperties }) {
  return (
    <span
      style={{
        ...secondaryCapsule(p),
        display: "flex",
        fontFamily: FONTS.sans,
        fontWeight: 700,
        fontSize: p.u(fs),
        letterSpacing: "0.2em",
        lineHeight: 1,
        padding: "0.42em 0.72em 0.38em 0.92em",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {text}
    </span>
  );
}

// A short horizontal pill that marks each Q&A label.
function Mark({ p, w, h }: { p: BackThemeProps; w: number; h: number }) {
  return (
    <span
      style={{ flex: "0 0 auto", width: p.u(w), height: p.u(h), borderRadius: ROUND, background: pop(p).bg }}
    />
  );
}

function Header({ p }: { p: BackThemeProps }) {
  const hs = p.headshot;
  const ro = OUTER_RING(p);
  const right = hs ? hs.left - ro - HEADSHOT_CLEAR : p.W - M;
  const b = teamBlock(p, M, right);
  // Centre the block on the headshot (as the front centres it on the jersey
  // disc); without one, centre it in the band above the panel. Never above the
  // front's margin, and always clear of the panel.
  const centre = hs ? hs.top + hs.size / 2 : p.panelTop / 2;
  const top = Math.max(M, Math.min(centre - b.blockH / 2, p.panelTop - 2.5 - b.blockH));
  return (
    <>
      {hs && (
        // The jersey disc's secondary ring, behind the headshot (which paints
        // over it with its own primary ring).
        <div
          style={abs({
            left: p.u(hs.left - ro),
            top: p.u(hs.top - ro),
            width: p.u(hs.size + 2 * ro),
            height: p.u(hs.size + 2 * ro),
            borderRadius: ROUND,
            background: p.palette.subBackground,
            ...shadow(p, "drop-shadow(0 3px 7px rgba(0,0,0,0.38))"),
          })}
        />
      )}
      <PillTeam p={p} g={{ m: M, teamTop: top, team: b.team, sub: b.sub, teamFs: b.teamFs, subFs: b.subFs }} />
    </>
  );
}

// The jersey disc's diameter (u), beside the panel name.
const JERSEY_D = (p: BackThemeProps) => (p.landscape ? 7.2 : 8);

// "HEAD COACH" / "ASSISTANTS" → the front's coach-chip prefixes.
function coachPrefix(label: string) {
  if (label === "HEAD COACH") return "COACH";
  if (label === "ASSISTANTS") return "ASST.";
  return label;
}

// Splits a match name into two balanced lines at a word boundary, preferring a
// break after a joiner ("&", "AND", "+", "/", a trailing comma) so each pro's
// name stays whole: "LEBRON JAMES &" / "DWYANE WADE & CHRIS BOSH". Null when
// it's a single word.
function twoLines(name: string): [string, string] | null {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return null;
  const joiner = (w: string) => /^(&|AND|\+|\/)$/.test(w) || /[,&]$/.test(w);
  let breaks = words.map((_, i) => i).filter((i) => i > 0 && joiner(words[i - 1]));
  if (!breaks.length) breaks = words.map((_, i) => i).slice(1);
  const len = (i: number) => Math.max([...words.slice(0, i).join(" ")].length, [...words.slice(i).join(" ")].length);
  const at = breaks.reduce((best, i) => (len(i) < len(best) ? i : best));
  return [words.slice(0, at).join(" "), words.slice(at).join(" ")];
}

// Group back: below this one-line size (u) the match name wraps to two lines
// (never smaller than MATCH_FLOOR, nor bigger than MATCH_TWO_MAX) rather than
// shrinking under its blurb.
const MATCH_WRAP_AT = 3.2;
const MATCH_FLOOR = 3;
const MATCH_TWO_MAX = 3.8;

function Match({ p, m }: { p: BackThemeProps; m: BackMatchParts }) {
  const duo = p.variant === "duo";
  const L = p.landscape;
  const photo = duo ? (L ? 9.5 : 10.5) : L ? 9.5 : 11.5;
  const pad = L ? 0.65 : 1;
  // Right end: the text keeps clear of the capsule's round end.
  const endPad = L ? 4.6 : 5.2;
  const ring = L ? 0.84 : 0.6; // = the exporter's ring (0.6% of the canvas width)
  const photos = m.photos({
    width: p.u(photo),
    height: p.u(photo),
    aspectRatio: "1 / 1",
    flexShrink: 0,
    boxSizing: "border-box",
    borderRadius: ROUND,
    border: `${p.u(ring)} solid ${p.palette.subBackground}`,
  });
  const n = photos ? (duo ? 2 : 1) : 0;
  const gap = L ? 1.5 : 1.7;
  const photosW = n ? n * photo + (n - 1) * 0.35 * PANEL_EM + gap : 0;
  const avail = contentWidth(p) - 2 * CAP_RING - (photos ? pad : endPad) - photosW - endPad;
  const em = FONT_EM.archivo * 1.06;
  const one = fitSize(m.name, duo ? 4.4 : L ? 4 : 4.8, avail, em, 0.01);
  // The solo banner keeps one fitted line; the group's (often two or three
  // pros) wraps onto two when one line would be too small to read.
  const lines = duo && one < MATCH_WRAP_AT ? twoLines(m.name) : null;
  const nameFs = lines
    ? Math.max(MATCH_FLOOR, fitSize(lines[0].length > lines[1].length ? lines[0] : lines[1], MATCH_TWO_MAX, avail, em, 0.01))
    : one;
  const line: CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
  return (
    <div
      style={{
        ...(duo ? { flex: "0 0 auto" } : {}),
        ...primaryCapsule(p),
        display: "flex",
        alignItems: "center",
        gap: p.u(gap),
        padding: `${p.u(pad)} ${p.u(endPad)} ${p.u(pad)} ${p.u(photos ? pad : endPad)}`,
      }}
    >
      {photos}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        <Tag p={p} text={m.label} fs={L ? 1.3 : 1.45} />
        <div
          style={{
            maxWidth: "100%",
            marginTop: p.u(L ? 0.45 : 0.55),
            fontFamily: FONTS.archivo,
            fontSize: p.u(nameFs),
            letterSpacing: "0.01em",
            lineHeight: 1,
            ...(lines ? {} : line),
          }}
        >
          {lines
            ? lines.map((t, i) => (
                <div
                  key={i}
                  style={{
                    ...line,
                    // Air between the lines, plus room for accented capitals.
                    ...(i ? { marginTop: p.u(nameFs * 0.06 + accentLift(t, nameFs, 0.2)) } : {}),
                  }}
                >
                  {t}
                </div>
              ))
            : m.name}
        </div>
        {m.blurb && (
          <p
            style={{
              margin: `${p.u(L ? 0.35 : 0.45)} 0 0`,
              fontSize: p.u(L ? 2.05 : 2.25),
              lineHeight: 1.18,
              fontWeight: 600,
              opacity: 0.8,
            }}
          >
            {m.blurb}
          </p>
        )}
      </div>
    </div>
  );
}

// A coach line: the front's coach-chip prefix as a small pop-color tag, then
// the names, which wrap under themselves when the cell is too narrow.
function Coach({ p, label, value }: { p: BackThemeProps; label: string; value: string }) {
  const duo = p.variant === "duo";
  const L = p.landscape;
  const tag = coachPrefix(label);
  const text = value.trim().toUpperCase();
  // One line when it fits at a readable size, else wrap at the minimum. A cell
  // is half the portrait panel or the landscape's left column; on the group
  // back the head coach keeps its width and the assistants take the rest.
  const cell = duo ? (L ? 70 : 41) : L ? 43 : 39;
  const em = FONT_EM.sans * 1.1;
  const needEm = [...text].length * (em + 0.08) + [...tag].length * 0.72 * (em + 0.16) + 0.72 * 1.52 + 0.5;
  const base = duo ? 2.3 : L ? 2.1 : 2.25;
  const fs = Math.max(2, Math.min(base, Math.round((cell / needEm) * 100) / 100));
  const c = pop(p);
  // Group back: the head coach sizes to its line and the assistants take the
  // rest, but the assistants always keep their own line's width, up to half
  // the row (after the layout's 7% gap) — so a long head coach wraps in its
  // half instead of squeezing the assistants into a letter-wide column. With
  // no assistants, the head coach still has the whole row.
  const half = 0.465 * contentWidth(p);
  const flex: CSSProperties = !duo
    ? {}
    : label === "ASSISTANTS"
      ? { flex: "1 1 0", minWidth: p.u(Math.min(half, needEm * fs)) }
      : { flex: "0 1 auto" };
  return (
    <div
      style={{
        minWidth: 0,
        ...flex,
        display: "flex",
        alignItems: "flex-start",
        gap: "0.5em",
        fontFamily: FONTS.sans,
        fontWeight: 700,
        fontSize: p.u(fs),
        lineHeight: 1.22,
        color: TEXT,
      }}
    >
      <span
        style={{
          flex: "0 0 auto",
          background: c.bg,
          color: c.fg,
          borderRadius: ROUND,
          padding: "0.42em 0.68em 0.38em 0.84em",
          fontSize: "0.72em",
          letterSpacing: "0.16em",
          lineHeight: 1,
        }}
      >
        {tag}
      </span>
      {/* Wraps at word boundaries (and hyphens); only a word too long for a
          whole line breaks inside it. */}
      <span style={{ minWidth: 0, letterSpacing: "0.08em", overflowWrap: "break-word" }}>{text}</span>
    </div>
  );
}

export const pillBack: BackTheme = {
  header: (p) => <Header p={p} />,

  // The photo is the jersey disc: primary inner ring (the exporter strokes it at
  // 6.4% of the circle), secondary outer ring drawn by the header behind it.
  headshot: (p) => {
    const size = p.headshot?.size ?? (p.landscape ? 23.8 : 22);
    return {
      style: { boxSizing: "border-box", border: `${p.u(size * 0.064)} solid ${p.palette.background}` },
      ring: p.palette.background,
    };
  },

  panel: (p) => ({
    background: PANEL,
    borderRadius: p.u(p.landscape ? 6 : 7),
    color: TEXT,
    fontFamily: FONTS.sans,
    // Sizes the layout's em gaps in card units (the same at every preview size).
    fontSize: p.u(PANEL_EM),
    lineHeight: 1.25,
    // Very long write-ups end at the panel's edge instead of spilling over the
    // background toward the trim.
    overflow: "hidden",
  }),

  // The layout fixes the name's size, and Archivo Black (Pill's name face) is
  // ~60% wider than Anton: a name that won't fit in the card's font drops to
  // Anton, then Bebas, instead of being cut off.
  name: (p) => ({
    fontFamily: backNameFamily(p, { jerseyW: JERSEY_D(p), letterSpacing: 0.01 }),
    fontStyle: p.nameItalic ? "italic" : "normal",
    letterSpacing: "0.01em",
    lineHeight: p.variant === "duo" ? 1.05 : p.landscape ? 1.04 : 1,
    color: TEXT,
    textTransform: "uppercase",
  }),

  // The front's jersey disc, small: primary disc, secondary ring.
  jersey: (p, num) => {
    const D = JERSEY_D(p);
    const ring = p.landscape ? 0.6 : 0.65;
    return (
      <div
        style={{
          flex: "0 0 auto",
          alignSelf: p.landscape ? "flex-start" : "center",
          width: p.u(D),
          height: p.u(D),
          boxSizing: "border-box",
          borderRadius: ROUND,
          background: p.palette.background,
          border: `${p.u(ring)} solid ${p.palette.subBackground}`,
          color: p.palette.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONTS.archivo,
          fontSize: p.u(fitSize(num, D * 0.44, (D - 2 * ring) * 0.74, FONT_EM.archivo)),
          letterSpacing: "-0.01em",
          lineHeight: 1,
          paddingTop: "0.05em",
          whiteSpace: "nowrap",
        }}
      >
        {num}
      </div>
    );
  },

  // Stat chip: a primary capsule, dim label then the value on one line.
  stat: (p, k, v) => {
    const labelFs = 1.6;
    const labelW = [...k].length * (FONT_EM.sans * 1.1 + 0.14) * labelFs;
    // A cell is ~19u wide (four across in portrait, two in the landscape column).
    const avail = 19 - 2 * STAT_PAD_X - 2 * CAP_RING - STAT_GAP - labelW;
    return (
      <div
        style={{
          ...primaryCapsule(p),
          minWidth: 0,
          display: "flex",
          alignItems: "baseline",
          justifyContent: "center",
          gap: p.u(STAT_GAP),
          padding: `${p.u(1.1)} ${p.u(STAT_PAD_X)} ${p.u(1)}`,
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: p.u(labelFs), letterSpacing: "0.14em", fontWeight: 700, lineHeight: 1, opacity: 0.62 }}>
          {k}
        </span>
        <span
          style={{
            fontFamily: FONTS.archivo,
            fontSize: p.u(fitSize(v, 3.4, avail, FONT_EM.archivo)),
            lineHeight: 1,
          }}
        >
          {v}
        </span>
      </div>
    );
  },

  label: (p, text) => (
    <div style={{ display: "flex", marginBottom: p.u(p.landscape ? 0.55 : 0.7) }}>
      <Tag p={p} text={text} fs={p.landscape ? 1.4 : 1.55} />
    </div>
  ),

  // A small pop-color disc with an opening quote mark, then the words.
  quote: (p, text) => {
    const D = p.landscape ? 3.4 : 4;
    const c = pop(p);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: p.u(1.5) }}>
        <span
          style={{
            flex: "0 0 auto",
            alignSelf: "flex-start",
            width: p.u(D),
            height: p.u(D),
            borderRadius: ROUND,
            background: c.bg,
            color: c.fg,
            display: "flex",
            justifyContent: "center",
            fontFamily: FONTS.archivo,
            fontSize: p.u(D * 0.95),
            lineHeight: 1,
            paddingTop: `${D * 0.16}%`,
          }}
        >
          &ldquo;
        </span>
        <p
          style={{
            margin: 0,
            fontSize: p.u(p.landscape ? 2.7 : 2.9),
            lineHeight: 1.25,
            fontWeight: 600,
            color: TEXT,
          }}
        >
          {text}
        </p>
      </div>
    );
  },

  body: (p) => ({
    fontSize: p.u(p.landscape ? 2.65 : 2.75),
    lineHeight: p.landscape ? 1.27 : 1.32,
    fontWeight: 500,
    color: SOFT,
    margin: 0,
  }),

  qa: (p, label, value): ReactNode =>
    p.variant === "duo" ? (
      <div style={{ display: "flex", flexDirection: "column", gap: p.u(0.7) }}>
        <div style={{ display: "flex", alignItems: "center", gap: p.u(1) }}>
          <Mark p={p} w={2.2} h={0.95} />
          <span
            style={{
              fontSize: p.u(2.2),
              letterSpacing: "0.14em",
              fontWeight: 700,
              textTransform: "uppercase",
              color: DIM,
              lineHeight: 1,
            }}
          >
            {label}
          </span>
        </div>
        <span style={{ fontSize: p.u(3.5), fontWeight: 600, lineHeight: 1.2, color: TEXT }}>{value}</span>
      </div>
    ) : (
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: p.u(0.25) }}>
        <div style={{ display: "flex", alignItems: "center", gap: p.u(0.75) }}>
          <Mark p={p} w={1.6} h={0.72} />
          <span style={{ fontSize: p.u(1.6), letterSpacing: "0.14em", fontWeight: 700, color: DIM, lineHeight: 1 }}>
            {label}
          </span>
        </div>
        <div style={{ fontSize: p.u(p.landscape ? 2.55 : 2.7), fontWeight: 600, color: TEXT, lineHeight: 1.12, overflowWrap: "anywhere" }}>
          {value}
        </div>
      </div>
    ),

  match: (p, m) => <Match p={p} m={m} />,

  matchRing: (p) => p.palette.subBackground,

  coach: (p, label, value) => <Coach p={p} label={label} value={value} />,

  divider: (p) => ({
    borderTop: `1px solid ${RULE}`,
    paddingTop: p.u(p.variant === "duo" ? 1.8 : p.landscape ? 1.2 : 1.3),
  }),
};
