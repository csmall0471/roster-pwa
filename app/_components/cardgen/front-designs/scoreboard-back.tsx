// Scoreboard back — the broadcast graphics carried over from the front: the
// same score bug across the top, then a dark broadcast slate with a team-color
// accent bar. Section labels are small team-color tabs, the stat chips are
// box-score cells (a label tab over a value box, like the front's "NO." score
// box), the player name and the match banner are lower-third bars (a team-color
// box with a secondary cap, a secondary strip and a thin rule under it), and
// thin accent rules mark the Q&A, quote and coaching staff.

import type { CSSProperties, ReactNode } from "react";
import { FONTS, luminance, type BackTheme, type BackThemeProps } from "./shared";
import { ScoreBug } from "./scoreboard";

// ── Colors ───────────────────────────────────────────────────────────────────

// The slate: near-black and nearly opaque so its text reads over any card
// background, light or dark.
const SLATE =
  "linear-gradient(180deg, rgba(36,41,51,0.95) 0%, rgba(17,20,26,0.95) 45%, rgba(9,10,14,0.96) 100%)";
const TEXT = "#ffffff";
const MUTED = "rgba(255,255,255,0.6)";
const SOFT = "rgba(255,255,255,0.9)";

// Team colors as used on the slate. `lead` fills the tabs, the name bar and
// the accent rules; `alt` fills the value boxes, caps and strips. The primary
// leads, unless it is so dark it would vanish into the slate (navy, black) and
// the secondary is lighter — then the two swap so the tabs and rules still show.
type SlateColors = { lead: string; leadText: string; alt: string; altText: string };
const DARK_LEAD = 0.035; // WCAG luminance; navy ≈ 0.015, maroon ≈ 0.053

function colors(p: BackThemeProps): SlateColors {
  const { background, color, subBackground, subColor } = p.palette;
  const swap = luminance(background) < DARK_LEAD && luminance(subBackground) > luminance(background);
  return swap
    ? { lead: subBackground, leadText: subColor, alt: background, altText: color }
    : { lead: background, leadText: color, alt: subBackground, altText: subColor };
}

// Broadcast plate: a soft top-down highlight over a solid color (same as the
// front's plates).
function sheen(color: string) {
  return `linear-gradient(180deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0) 70%), ${color}`;
}

// ── Geometry (u) ─────────────────────────────────────────────────────────────

const BAR = 0.8; // panel accent bar
const RULE = 0.45; // rule under the jersey box, stat cells and lower thirds
const TICK = 0.45; // accent tick left of the Q&A, quote and coach items
const CAP = 1.2; // secondary cap at the right end of a lower-third bar
const HEADSHOT_GAP = 3; // header ↔ headshot (≥ 3u required)
const PANEL_GAP = 1.5; // header ↔ panel top

// Small caps label (tabs, Q&A labels, coach labels).
function caps(p: BackThemeProps, size: number, extra?: CSSProperties): CSSProperties {
  return {
    fontFamily: FONTS.sans,
    fontSize: p.u(size),
    fontWeight: 800,
    letterSpacing: "0.18em",
    lineHeight: 1.1,
    textTransform: "uppercase",
    ...extra,
  };
}

// Q&A / coach item: a thin accent tick down the left side.
function ticked(p: BackThemeProps, c: SlateColors): CSSProperties {
  return { borderLeft: `${p.u(TICK)} solid ${c.lead}`, paddingLeft: p.u(1.1), minWidth: 0 };
}

// ── Pieces ───────────────────────────────────────────────────────────────────

// Score box: a "NO." tab over a value box with a thin rule under it.
function ScoreBox({ p, num }: { p: BackThemeProps; num: string }) {
  const c = colors(p);
  const L = p.landscape;
  const size = num.length > 2 ? (L ? 3.5 : 4) : L ? 4.4 : 5;
  return (
    <div
      style={{
        flex: "0 0 auto",
        alignSelf: L ? "flex-start" : "center",
        display: "flex",
        flexDirection: "column",
        minWidth: p.u(L ? 8.4 : 10),
        borderBottom: `${p.u(RULE)} solid ${c.lead}`,
      }}
    >
      <div
        style={{
          ...caps(p, L ? 1.4 : 1.5, { letterSpacing: "0.24em", lineHeight: 1 }),
          height: p.u(L ? 2 : 2.2),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingLeft: "0.24em", // balance the trailing letter-spacing
          background: c.lead,
          color: c.leadText,
        }}
      >
        NO.
      </div>
      <div
        style={{
          height: p.u(L ? 5 : 5.6),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: `0 ${p.u(1.2)}`,
          background: sheen(c.alt),
          color: c.altText,
          fontFamily: FONTS.anton,
          fontSize: p.u(size),
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

// Lower third: a lead box (label over a big name) with a secondary cap, a
// secondary strip for the blurb and a thin lead rule under the stack.
function LowerThird({
  p,
  label,
  name,
  blurb,
  nameSize,
  wrapName,
  dense,
}: {
  p: BackThemeProps;
  label: string;
  name: string;
  blurb?: string;
  nameSize: number;
  wrapName: boolean;
  dense: boolean;
}) {
  const c = colors(p);
  const padX = dense ? 1.4 : 1.6;
  return (
    <div
      style={{
        flex: "1 1 auto",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        borderBottom: `${p.u(RULE)} solid ${c.lead}`,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: p.u(dense ? 0.4 : 0.45),
          padding: `${p.u(dense ? 0.6 : 0.75)} ${p.u(padX)}`,
          borderRight: `${p.u(CAP)} solid ${c.alt}`,
          background: sheen(c.lead),
          color: c.leadText,
        }}
      >
        <div style={caps(p, dense ? 1.3 : 1.45, { letterSpacing: "0.22em", lineHeight: 1, opacity: 0.72 })}>{label}</div>
        <div
          style={{
            fontFamily: FONTS.anton,
            fontSize: p.u(nameSize),
            letterSpacing: "0.02em",
            lineHeight: 1.02,
            ...(wrapName ? {} : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }),
          }}
        >
          {name}
        </div>
      </div>
      {blurb && (
        <div
          style={{
            padding: `${p.u(dense ? 0.5 : 0.6)} ${p.u(padX)}`,
            background: c.alt,
            color: c.altText,
            fontFamily: FONTS.sans,
            fontSize: p.u(dense ? 2 : 2.1),
            fontWeight: 600,
            lineHeight: 1.2,
          }}
        >
          {blurb}
        </div>
      )}
    </div>
  );
}

// ── Theme ────────────────────────────────────────────────────────────────────

export const scoreboardBack: BackTheme = {
  // The front's score bug, without the jersey: it runs up to the headshot (or
  // the right margin) and lifts when the panel starts high (group landscape).
  header: (p) => (
    <ScoreBug
      p={p}
      right={p.headshot ? p.headshot.left - HEADSHOT_GAP : p.W - 6}
      maxBottom={p.panelTop - PANEL_GAP}
    />
  ),

  headshot: (p) => {
    const c = colors(p);
    // The exporter strokes the ring at 6.4% of the circle; match it here.
    const size = p.headshot?.size ?? 22;
    return {
      style: {
        border: `${p.u(size * 0.064)} solid ${c.lead}`,
        boxSizing: "border-box",
        filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.45))",
      },
      ring: c.lead,
    };
  },

  panel: (p) => {
    const c = colors(p);
    return {
      // Lead accent bar on top with a secondary hairline under it, like the
      // bug's team box over its season strip.
      borderTop: `${p.u(BAR)} solid ${c.lead}`,
      background: `linear-gradient(180deg, ${c.alt} 0, ${c.alt} ${p.u(0.35)}, transparent ${p.u(0.35)}), ${SLATE}`,
      borderRadius: 0,
      color: TEXT,
      fontFamily: FONTS.sans,
      // em-based gaps in the layout scale with the card instead of the page.
      fontSize: p.u(2.4),
    };
  },

  // Player name as a lower-third bar: the lead box with a secondary cap.
  name: (p) => {
    const c = colors(p);
    const duo = p.variant === "duo";
    return {
      fontFamily: p.nameFont.family,
      fontStyle: p.nameItalic ? "italic" : "normal",
      letterSpacing: "0.01em",
      lineHeight: duo ? 1.05 : 1,
      textTransform: "uppercase",
      color: c.leadText,
      background: sheen(c.lead),
      borderRight: `${p.u(CAP)} solid ${c.alt}`,
      // Italic names lean right: extra right padding keeps the last letter on
      // the plate.
      padding: `0.1em ${p.nameItalic ? "0.42em" : "0.3em"} ${p.landscape && !duo ? "0.06em" : "0.08em"} 0.3em`,
      alignSelf: duo ? "flex-start" : p.landscape ? "flex-start" : "center",
      maxWidth: "100%",
    };
  },

  jersey: (p, num) => <ScoreBox p={p} num={num} />,

  // Box-score cell: a lead label tab over a secondary value box.
  stat: (p, k, v) => {
    const c = colors(p);
    const L = p.landscape;
    return (
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", borderBottom: `${p.u(RULE)} solid ${c.lead}` }}>
        <div
          style={{
            ...caps(p, L ? 1.35 : 1.45, { letterSpacing: "0.2em", lineHeight: 1 }),
            height: p.u(L ? 2 : 2.1),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            paddingLeft: "0.2em",
            background: c.lead,
            color: c.leadText,
          }}
        >
          {k}
        </div>
        <div
          style={{
            height: p.u(L ? 4.4 : 4.8),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: `0 ${p.u(0.6)}`,
            background: sheen(c.alt),
            color: c.altText,
            fontFamily: FONTS.anton,
            fontSize: p.u(v.length > 4 ? (L ? 2.6 : 2.9) : L ? 3.4 : 3.7),
            letterSpacing: "0.02em",
            lineHeight: 1,
          }}
        >
          <span style={{ minWidth: 0, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {v}
          </span>
        </div>
      </div>
    );
  },

  // Section label: a small lead tab with a thin rule running off to the right.
  label: (p, text) => {
    const c = colors(p);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: p.u(1), marginBottom: p.u(p.landscape ? 0.7 : 0.9) }}>
        <div
          style={{
            ...caps(p, p.landscape ? 1.4 : 1.5, { letterSpacing: "0.2em", lineHeight: 1 }),
            flex: "0 0 auto",
            padding: `${p.u(0.45)} ${p.u(0.75)} ${p.u(0.45)} ${p.u(0.95)}`,
            background: c.lead,
            color: c.leadText,
            whiteSpace: "nowrap",
          }}
        >
          {text}
        </div>
        <div style={{ flex: "1 1 auto", height: p.u(0.25), background: c.lead, opacity: 0.55 }} />
      </div>
    );
  },

  quote: (p, text) => {
    const c = colors(p);
    return (
      <div style={{ display: "flex", alignItems: "stretch", gap: p.u(1.3) }}>
        <div style={{ flex: "0 0 auto", width: p.u(0.8), background: c.lead }} />
        <p
          style={{
            margin: 0,
            fontSize: p.u(p.landscape ? 2.6 : 2.8),
            lineHeight: 1.3,
            fontStyle: "italic",
            fontWeight: 600,
            color: TEXT,
          }}
        >
          &ldquo;{text}&rdquo;
        </p>
      </div>
    );
  },

  body: (p) => ({
    fontSize: p.u(p.landscape ? 2.5 : 2.75),
    lineHeight: p.landscape ? 1.3 : 1.35,
    fontWeight: 500,
    color: SOFT,
    margin: 0,
  }),

  qa: (p, label, value) => {
    const c = colors(p);
    if (p.variant === "duo") {
      return (
        <div style={{ ...ticked(p, c), display: "flex", flexDirection: "column", gap: p.u(0.6), paddingLeft: p.u(1.4) }}>
          <span style={caps(p, 1.9, { color: MUTED, lineHeight: 1 })}>{label}</span>
          <span style={{ fontSize: p.u(3.5), fontWeight: 600, lineHeight: 1.2, color: TEXT }}>{value}</span>
        </div>
      );
    }
    return (
      <div style={ticked(p, c)}>
        <div style={caps(p, p.landscape ? 1.4 : 1.45, { letterSpacing: "0.14em", color: MUTED })}>{label}</div>
        <div
          style={{
            marginTop: p.u(0.2),
            fontSize: p.u(p.landscape ? 2.45 : 2.6),
            fontWeight: 700,
            lineHeight: 1.15,
            color: TEXT,
            overflowWrap: "anywhere",
          }}
        >
          {value}
        </div>
      </div>
    );
  },

  // Lower-third match banner, the photo circle(s) to its left.
  match: (p, m) => {
    const c = colors(p);
    const duo = p.variant === "duo";
    const L = !duo && p.landscape;
    // The exporter strokes match rings at 0.6% of the export's width (the long
    // edge on a landscape card); match it here.
    const ringW = p.landscape ? 0.84 : 0.6;
    const photos: ReactNode = m.photos({
      width: p.u(duo ? 10 : L ? 9.4 : 11.5),
      aspectRatio: "1 / 1",
      flexShrink: 0,
      borderRadius: "9999px",
      border: `${p.u(ringW)} solid ${c.alt}`,
      boxSizing: "border-box",
    });
    return (
      <div style={{ ...(duo ? { flex: "0 0 auto" } : {}), display: "flex", alignItems: "center", gap: p.u(duo || L ? 1.3 : 1.6) }}>
        {photos}
        <LowerThird
          p={p}
          label={m.label}
          name={m.name}
          blurb={m.blurb}
          nameSize={duo ? 4.2 : L ? 4.2 : 4.8}
          wrapName={duo}
          dense={L || duo}
        />
      </div>
    );
  },

  matchRing: (p) => colors(p).alt,

  coach: (p, label, value) => {
    const c = colors(p);
    return (
      <div style={ticked(p, c)}>
        <div style={caps(p, 1.45, { color: MUTED, marginBottom: p.u(0.4), lineHeight: 1 })}>{label}</div>
        <div
          style={{
            fontFamily: FONTS.anton,
            fontSize: p.u(3),
            lineHeight: 1.08,
            letterSpacing: "0.03em",
            textTransform: "uppercase",
            color: TEXT,
          }}
        >
          {value}
        </div>
      </div>
    );
  },

  divider: (p) => {
    const c = colors(p);
    return {
      borderTop: `${p.u(0.3)} solid ${c.lead}`,
      paddingTop: p.variant === "duo" ? "3%" : p.u(p.landscape ? 1.2 : 1.6),
    };
  },
};
