// Team-name treatments for the card front (the "PIRANHAS / 8U · Fall 2026"
// block in the top-left). Each style is plain CSS — solid colors, borders,
// clip-path, transforms and text-shadow — so it survives the html-to-image
// overlay capture on iOS like the rest of the overlay (no raster, no
// background-clip:text). Sizes come from a unit function so one renderer serves
// the live card (calc(var(--cardw) …)), the background swatches and the style
// picker tiles (cqw).

import type { CSSProperties, ReactNode } from "react";

export const DEFAULT_TEAM_STYLE = "chevron";
export const AUTO_TEAM_COLORS = "auto";

export type TeamStyle = { id: string; name: string };

export const TEAM_STYLES: TeamStyle[] = [
  { id: "chevron", name: "Classic" },
  { id: "racing", name: "Racing" },
  { id: "ribbon", name: "Ribbon" },
  { id: "scoreboard", name: "Scoreboard" },
  { id: "pill", name: "Pill" },
  { id: "varsity", name: "Varsity" },
  { id: "stamp", name: "Stamp" },
  { id: "sidebar", name: "Sidebar" },
  { id: "marker", name: "Marker" },
  { id: "minimal", name: "Minimal" },
];

export function getTeamStyle(id: string | null | undefined): TeamStyle {
  return TEAM_STYLES.find((s) => s.id === id) ?? TEAM_STYLES[0];
}

// Plate colors. `background`/`color` = the team-name plate; `subBackground`/
// `subColor` = the age · season strip (and accents like stripes or 3D shadow).
// Same shape as a frame's teamPlate so a frame can feed it directly.
export type TeamPalette = {
  background: string;
  color: string;
  subBackground: string;
  subColor: string;
};

export const CLASSIC_PALETTE: TeamPalette = {
  background: "#ffffff",
  color: "#0a0a0a",
  subBackground: "#0a0a0a",
  subColor: "#ffffff",
};

export type TeamColors = { id: string; name: string; palette: TeamPalette };

export const TEAM_COLORS: TeamColors[] = [
  { id: "white", name: "White", palette: CLASSIC_PALETTE },
  { id: "black", name: "Black", palette: { background: "#0a0a0a", color: "#ffffff", subBackground: "#ffffff", subColor: "#0a0a0a" } },
  { id: "red", name: "Red", palette: { background: "#c8102e", color: "#ffffff", subBackground: "#0a0a0a", subColor: "#ffffff" } },
  { id: "royal", name: "Royal", palette: { background: "#1d4ed8", color: "#ffffff", subBackground: "#0a0a0a", subColor: "#ffffff" } },
  { id: "navy-gold", name: "Navy & Gold", palette: { background: "#0b1f4a", color: "#ffffff", subBackground: "#d4af37", subColor: "#0b1f4a" } },
  { id: "gold", name: "Gold", palette: { background: "#d4af37", color: "#0a0a0a", subBackground: "#0a0a0a", subColor: "#f5d67b" } },
  { id: "green", name: "Green", palette: { background: "#047857", color: "#ffffff", subBackground: "#0a0a0a", subColor: "#ffffff" } },
  { id: "teal", name: "Teal", palette: { background: "#0f766e", color: "#ffffff", subBackground: "#f97316", subColor: "#ffffff" } },
  { id: "orange", name: "Orange", palette: { background: "#ea580c", color: "#ffffff", subBackground: "#0a0a0a", subColor: "#ffffff" } },
  { id: "purple", name: "Purple", palette: { background: "#6d28d9", color: "#ffffff", subBackground: "#facc15", subColor: "#2e1065" } },
  { id: "pink", name: "Pink", palette: { background: "#db2777", color: "#ffffff", subBackground: "#0a0a0a", subColor: "#ffffff" } },
  { id: "silver", name: "Silver", palette: { background: "#e2e8f0", color: "#0a0a0a", subBackground: "#334155", subColor: "#ffffff" } },
];

// Explicit color choice wins; "auto" follows the frame's team plate, else the
// classic white/black.
export function resolveTeamPalette(
  colorsId: string | null | undefined,
  framePalette: TeamPalette | null | undefined
): { palette: TeamPalette; explicit: boolean } {
  const chosen = colorsId && colorsId !== AUTO_TEAM_COLORS ? TEAM_COLORS.find((c) => c.id === colorsId) : null;
  if (chosen) return { palette: chosen.palette, explicit: true };
  if (framePalette) return { palette: framePalette, explicit: true };
  return { palette: CLASSIC_PALETTE, explicit: false };
}

const ANTON = "var(--font-anton), Impact, sans-serif";
const BEBAS = "var(--font-bebas), Impact, sans-serif";
const OSWALD = "var(--font-oswald), Impact, sans-serif";
const ARCHIVO = "var(--font-archivo-black), Impact, sans-serif";
const BUNGEE = "var(--font-bungee), Impact, sans-serif";
const STENCIL = "var(--font-black-ops), Impact, sans-serif";
const MARKER = "var(--font-marker), Impact, sans-serif";
const SANS = "var(--font-geist-sans), system-ui, sans-serif";

// Units for a card-width-relative size: `n` percent of the card's short edge.
export type CardUnit = (n: number) => string;
export const cardWidthUnit: CardUnit = (n) => `calc(var(--cardw, 22rem) * ${n} / 100)`;
export const containerUnit = (scale = 1): CardUnit => (n) => `${+(n * scale).toFixed(3)}cqw`;

export type TeamPlateProps = {
  styleId: string | null | undefined;
  team: string;
  age: string;
  season: string;
  palette: TeamPalette;
  // True when the colors came from a frame or an explicit pick (text-only
  // styles then use them instead of following the light/dark text scheme).
  explicitColors: boolean;
  u: CardUnit;
  top: string;
  // Left inset when a frame is active (plates tuck inside the border);
  // null = no frame, so bleed styles run flush to the card edge.
  framedLeft: string | null;
  // Scheme-aware title color/shadow for the text-only styles.
  textColor: string;
  textShadow: string;
  showSub?: boolean;
  // Skip px drop-shadows (tiny swatches).
  compact?: boolean;
};

export function TeamPlate(props: TeamPlateProps) {
  const { styleId, framedLeft, top, compact } = props;
  const style = getTeamStyle(styleId);
  const framed = framedLeft != null;
  const bleed = BLEED_STYLES.has(style.id);
  // Inside a frame, the unplated/tilted styles step a little further in so
  // their letters and tilted corners clear the frame's keyline.
  const nudge = framed ? FRAMED_NUDGE[style.id] : undefined;
  const wrapper: CSSProperties = {
    position: "absolute",
    top: nudge ? `calc(${top} + ${props.u(nudge)})` : top,
    left: framed
      ? nudge
        ? `calc(${framedLeft} + ${props.u(1.5)})`
        : framedLeft
      : bleed
        ? 0
        : props.u(INSET_LEFT[style.id] ?? 6),
    pointerEvents: "none",
    ...(compact ? {} : { filter: SHADOW[style.id] ?? "drop-shadow(0 4px 10px rgba(0,0,0,0.45))" }),
  };
  return <div style={wrapper}>{RENDER[style.id](props, framed)}</div>;
}

const BLEED_STYLES = new Set(["chevron", "racing", "ribbon", "scoreboard", "sidebar"]);
const INSET_LEFT: Record<string, number> = { pill: 6, varsity: 6, stamp: 7, marker: 6, minimal: 7 };
// Extra top offset (card-width %) inside a frame. Stamp/marker are tilted, so
// their raised right corner needs the most room.
const FRAMED_NUDGE: Record<string, number> = { pill: 2, varsity: 2.5, stamp: 5.5, marker: 4.5, minimal: 2.5 };
const SHADOW: Record<string, string> = {
  varsity: "drop-shadow(0 3px 6px rgba(0,0,0,0.35))",
  minimal: "none",
};

// Left padding on the first plate of a bleed style: keeps the text clear of the
// print trim when the plate runs off the edge; normal padding inside a frame.
function bleedPad(p: TeamPlateProps, framed: boolean, normal: string) {
  return framed ? normal : p.u(9);
}

function subText(p: TeamPlateProps) {
  if (p.showSub === false) return "";
  return [p.age, p.season].filter(Boolean).join(" · ");
}

function teamText(p: TeamPlateProps) {
  return p.team || "TEAM";
}

const RENDER: Record<string, (p: TeamPlateProps, framed: boolean) => ReactNode> = {
  // The original: stacked chevron-cut chips, flush to the left edge.
  chevron(p, framed) {
    const sub = subText(p);
    return (
      <>
        <div
          style={{
            background: p.palette.background,
            color: p.palette.color,
            padding: framed ? "0.38em 1.4em" : `0.38em 1.6em 0.38em ${p.u(9)}`,
            clipPath: "polygon(0 0, 100% 0, calc(100% - 0.8em) 100%, 0 100%)",
            fontFamily: ANTON,
            fontSize: p.u(7),
            letterSpacing: "0.04em",
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          {teamText(p)}
        </div>
        {sub && (
          <div
            style={{
              background: p.palette.subBackground,
              color: p.palette.subColor,
              padding: framed ? "0.45em 1.4em" : `0.45em 1.6em 0.45em ${p.u(9)}`,
              clipPath: "polygon(0 0, 100% 0, calc(100% - 0.7em) 100%, 0 100%)",
              fontFamily: SANS,
              fontSize: p.u(2.7),
              letterSpacing: "0.22em",
              fontWeight: 700,
              marginTop: "-1px",
              whiteSpace: "nowrap",
            }}
          >
            {sub}
          </div>
        )}
      </>
    );
  },

  // Slanted plate trailed by two speed stripes; the sub strip steps in below.
  racing(p, framed) {
    const sub = subText(p);
    const skew = "skewX(-16deg)";
    const unskew = "skewX(16deg)";
    return (
      <div style={{ marginLeft: framed ? 0 : p.u(-3) }}>
        <div style={{ display: "flex", alignItems: "stretch", fontSize: p.u(7.4) }}>
          <div
            style={{
              background: p.palette.background,
              color: p.palette.color,
              transform: skew,
              padding: `0.3em 0.55em 0.3em ${framed ? "0.55em" : p.u(12)}`,
              fontFamily: ANTON,
              letterSpacing: "0.05em",
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ display: "inline-block", transform: unskew }}>{teamText(p)}</span>
          </div>
          <div style={{ width: "0.2em", marginLeft: "0.12em", background: p.palette.subBackground, transform: skew }} />
          <div style={{ width: "0.12em", marginLeft: "0.1em", background: p.palette.background, transform: skew }} />
        </div>
        {sub && (
          <div
            style={{
              display: "inline-block",
              marginTop: p.u(0.8),
              marginLeft: framed ? p.u(1.5) : p.u(4),
              background: p.palette.subBackground,
              color: p.palette.subColor,
              transform: skew,
              padding: `0.45em 1.1em 0.45em ${framed ? "1.1em" : p.u(8)}`,
              fontFamily: SANS,
              fontSize: p.u(2.6),
              fontWeight: 800,
              letterSpacing: "0.24em",
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ display: "inline-block", transform: unskew }}>{sub}</span>
          </div>
        )}
      </div>
    );
  },

  // Banner with a swallowtail end and stitched top/bottom rules.
  ribbon(p, framed) {
    const sub = subText(p);
    return (
      <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start" }}>
        <div
          style={{
            background: p.palette.background,
            color: p.palette.color,
            borderTop: `${p.u(0.7)} solid ${p.palette.subBackground}`,
            borderBottom: `${p.u(0.7)} solid ${p.palette.subBackground}`,
            padding: `0.18em 1.5em 0.14em ${bleedPad(p, framed, "0.7em")}`,
            clipPath: "polygon(0 0, 100% 0, calc(100% - 0.5em) 50%, 100% 100%, 0 100%)",
            fontFamily: OSWALD,
            fontWeight: 700,
            fontSize: p.u(7),
            letterSpacing: "0.07em",
            lineHeight: 1.05,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {teamText(p)}
        </div>
        {sub && (
          <div
            style={{
              marginTop: p.u(0.6),
              background: p.palette.subBackground,
              color: p.palette.subColor,
              padding: `0.5em 2em 0.5em ${bleedPad(p, framed, "1.1em")}`,
              clipPath: "polygon(0 0, 100% 0, calc(100% - 0.8em) 50%, 100% 100%, 0 100%)",
              fontFamily: SANS,
              fontSize: p.u(2.5),
              fontWeight: 700,
              letterSpacing: "0.22em",
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            {sub}
          </div>
        )}
      </div>
    );
  },

  // TV score-bug: a solid age block beside the team name, season underneath.
  scoreboard(p, framed) {
    const age = p.showSub === false ? "" : p.age;
    const season = p.showSub === false ? "" : p.season;
    return (
      <div style={{ display: "flex", alignItems: "stretch" }}>
        {age ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: p.palette.subBackground,
              color: p.palette.subColor,
              padding: `0 0.32em 0 ${bleedPad(p, framed, "0.32em")}`,
              fontFamily: ANTON,
              fontSize: p.u(6.4),
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            {age}
          </div>
        ) : (
          <div style={{ width: framed ? p.u(1.4) : p.u(7), background: p.palette.subBackground }} />
        )}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              background: p.palette.background,
              color: p.palette.color,
              padding: "0.28em 0.6em",
              fontFamily: ANTON,
              fontSize: p.u(6.4),
              letterSpacing: "0.04em",
              lineHeight: 1,
              whiteSpace: "nowrap",
              borderLeft: `${p.u(0.6)} solid ${p.palette.background === "#ffffff" ? "#e5e7eb" : "rgba(255,255,255,0.35)"}`,
            }}
          >
            {teamText(p)}
          </div>
          {season && (
            <div
              style={{
                background: p.palette.subBackground,
                color: p.palette.subColor,
                padding: "0.4em 0.9em",
                fontFamily: SANS,
                fontSize: p.u(2.3),
                fontWeight: 700,
                letterSpacing: "0.24em",
                lineHeight: 1,
                textTransform: "uppercase",
                whiteSpace: "nowrap",
                textAlign: "right",
              }}
            >
              {season}
            </div>
          )}
        </div>
      </div>
    );
  },

  // Rounded capsules, inset from the edge.
  pill(p) {
    const sub = subText(p);
    return (
      <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start" }}>
        <div
          style={{
            background: p.palette.background,
            color: p.palette.color,
            borderRadius: "999px",
            padding: "0.34em 0.85em 0.3em",
            fontFamily: ARCHIVO,
            fontSize: p.u(5.6),
            letterSpacing: "0.02em",
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          {teamText(p)}
        </div>
        {sub && (
          <div
            style={{
              marginTop: p.u(1),
              marginLeft: p.u(1.2),
              background: p.palette.subBackground,
              color: p.palette.subColor,
              borderRadius: "999px",
              padding: "0.5em 1.1em",
              fontFamily: SANS,
              fontSize: p.u(2.5),
              fontWeight: 700,
              letterSpacing: "0.2em",
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            {sub}
          </div>
        )}
      </div>
    );
  },

  // No plate: chunky letters with an outlined, stepped 3D shadow.
  varsity(p) {
    const sub = subText(p);
    const fill = p.palette.background;
    const edge = p.palette.subBackground === p.palette.background ? p.palette.color : p.palette.subBackground;
    const outline = [
      `-0.035em -0.035em 0 ${edge}`,
      `0.035em -0.035em 0 ${edge}`,
      `-0.035em 0.035em 0 ${edge}`,
      `0.035em 0.035em 0 ${edge}`,
    ];
    const depth = [1, 2, 3, 4].map((i) => `${(0.035 + i * 0.025).toFixed(3)}em ${(0.035 + i * 0.025).toFixed(3)}em 0 ${edge}`);
    return (
      <div>
        <div
          style={{
            color: fill,
            fontFamily: BUNGEE,
            fontSize: p.u(7.2),
            lineHeight: 1,
            letterSpacing: "0.02em",
            whiteSpace: "nowrap",
            textShadow: [...outline, ...depth].join(", "),
          }}
        >
          {teamText(p)}
        </div>
        {sub && (
          <div
            style={{
              marginTop: p.u(1.6),
              color: fill,
              fontFamily: OSWALD,
              fontWeight: 700,
              fontSize: p.u(2.9),
              letterSpacing: "0.32em",
              lineHeight: 1,
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              textShadow: `0 0 0.18em ${edge}, 0.06em 0.06em 0 ${edge}`,
            }}
          >
            {sub}
          </div>
        )}
      </div>
    );
  },

  // Tilted double-ruled stencil stamp with the age/season under a rule.
  stamp(p) {
    const sub = subText(p);
    return (
      <div
        style={{
          transform: "rotate(-5deg)",
          transformOrigin: "left top",
          background: p.palette.background,
          padding: p.u(0.8),
          display: "inline-block",
        }}
      >
        <div
          style={{
            border: `${p.u(0.45)} solid ${p.palette.color}`,
            color: p.palette.color,
            padding: `${p.u(1.4)} ${p.u(3)} ${p.u(1.2)}`,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontFamily: STENCIL,
              fontSize: p.u(6.2),
              letterSpacing: "0.06em",
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            {teamText(p)}
          </div>
          {sub && (
            <div
              style={{
                marginTop: p.u(1.2),
                paddingTop: p.u(1),
                borderTop: `${p.u(0.3)} solid ${p.palette.color}`,
                fontFamily: SANS,
                fontSize: p.u(2.4),
                fontWeight: 800,
                letterSpacing: "0.26em",
                lineHeight: 1,
                whiteSpace: "nowrap",
              }}
            >
              {sub}
            </div>
          )}
        </div>
      </div>
    );
  },

  // Classic trading-card sidebar: the team name runs up the left edge.
  // Built horizontally (team plate over sub strip, right-aligned) and turned
  // -90°, so the plate's top edge becomes the card edge and text reads upward.
  sidebar(p, framed) {
    const sub = subText(p);
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          transform: "rotate(-90deg) translateX(-100%)",
          transformOrigin: "left top",
        }}
      >
        <div
          style={{
            background: p.palette.background,
            color: p.palette.color,
            padding: `${framed ? "0.3em" : p.u(6)} 0.5em 0.24em 1.4em`,
            clipPath: "polygon(0.7em 0, 100% 0, 100% 100%, 0 100%)",
            fontFamily: ANTON,
            fontSize: p.u(6.6),
            letterSpacing: "0.06em",
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          {teamText(p)}
        </div>
        {sub && (
          <div
            style={{
              background: p.palette.subBackground,
              color: p.palette.subColor,
              padding: "0.5em 0.9em 0.5em 1.6em",
              clipPath: "polygon(0.9em 0, 100% 0, 100% 100%, 0 100%)",
              fontFamily: SANS,
              fontSize: p.u(2.4),
              fontWeight: 700,
              letterSpacing: "0.22em",
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            {sub}
          </div>
        )}
      </div>
    );
  },

  // Hand-lettered marker on a torn-tape swatch, slightly tilted.
  marker(p) {
    const sub = subText(p);
    return (
      <div style={{ transform: "rotate(-4deg)", transformOrigin: "left top" }}>
        <div
          style={{
            display: "inline-block",
            background: p.palette.background,
            color: p.palette.color,
            padding: "0.16em 0.55em 0.08em 0.45em",
            borderRadius: "0.5em 0.18em 0.6em 0.14em / 0.28em 0.55em 0.22em 0.5em",
            fontFamily: MARKER,
            fontSize: p.u(7),
            lineHeight: 1.05,
            whiteSpace: "nowrap",
          }}
        >
          {teamText(p)}
        </div>
        {sub && (
          <div>
            <div
              style={{
                display: "inline-block",
                marginTop: p.u(0.8),
                marginLeft: p.u(3),
                background: p.palette.subBackground,
                color: p.palette.subColor,
                padding: "0.35em 0.8em 0.25em",
                borderRadius: "0.3em 0.9em 0.25em 0.8em / 0.6em 0.3em 0.7em 0.35em",
                fontFamily: MARKER,
                fontSize: p.u(3),
                letterSpacing: "0.06em",
                lineHeight: 1,
                whiteSpace: "nowrap",
              }}
            >
              {sub}
            </div>
          </div>
        )}
      </div>
    );
  },

  // Clean letter-spaced type over a thin accent rule. Follows the card's
  // light/dark text scheme unless colors were picked.
  minimal(p) {
    const sub = subText(p);
    const color = p.explicitColors ? p.palette.background : p.textColor;
    const accent = p.explicitColors ? p.palette.subBackground : p.textColor;
    const shadow = p.explicitColors ? "0 1px 6px rgba(0,0,0,0.45)" : p.textShadow;
    return (
      <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start" }}>
        <div
          style={{
            color,
            textShadow: shadow,
            fontFamily: BEBAS,
            fontSize: p.u(8.6),
            letterSpacing: "0.16em",
            lineHeight: 0.95,
            whiteSpace: "nowrap",
          }}
        >
          {teamText(p)}
        </div>
        <div
          style={{
            alignSelf: "stretch",
            height: p.u(0.55),
            marginTop: p.u(0.9),
            background: accent,
          }}
        />
        {sub && (
          <div
            style={{
              marginTop: p.u(1.1),
              color,
              textShadow: shadow,
              fontFamily: SANS,
              fontSize: p.u(2.7),
              fontWeight: 600,
              letterSpacing: "0.34em",
              lineHeight: 1,
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {sub}
          </div>
        )}
      </div>
    );
  },
};
