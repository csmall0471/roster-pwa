// Sidebar back — the front's L-frame turned into a framed 1990s stat sheet.
//
// Header: the front's team block laid flat. A primary plate bleeds off the
// top-left corner with the team name in Anton (same secondary pop), the
// secondary pinstripe traces its two inner edges, and the AGE · SEASON tab
// grows out of the pinstripe under it with the same angled end.
//
// Panel: a team-tinted dark sheet inside a solid primary frame band with the
// secondary pinstripe on its inner edge (the L's band + pinstripe, all round).
// Stats read as a stat-table row (primary column heads over a pinstripe),
// section labels are primary tabs on a rule, the quote hangs off a mini
// sidebar, and the player / duo match is a primary band carrying a secondary
// tab, like the front's name band.
//
// Attached to the design in ./index.tsx (not in ./sidebar), so the import of
// ./sidebar's team-block pieces here is one-way.

import type { CSSProperties } from "react";
import {
  FONTS,
  FONT_EM,
  SAFE,
  abs,
  accentLift,
  backNameFamily,
  luminance,
  shadow,
  subLine,
  teamOrPlaceholder,
  type BackTheme,
  type BackThemeProps,
} from "./shared";
import {
  BLEED,
  CAP_H,
  CAP_TOP,
  JerseyDigits,
  K,
  SUB_F,
  SUB_LS,
  TAB_CUT,
  TAB_T,
  TEAM_LS,
  contrast,
  fit,
  plateShadow,
  pop,
  subTabStyle,
  teamNameStyle,
} from "./sidebar";

// ── Header geometry (u) ──────────────────────────────────────────────────────

const HDR_TEAM = 8.5; // team-name size (the front's is 6.8 up the narrow bar)
const HDR_CAP_TOP = SAFE + 0.6; // caps sit as far in from the top as the front's from the left
const HDR_TEXT_X = SAFE + 1; // team + sub text start (the front's name inset)
const HDR_END_PAD = 2.4; // plate past the caps / past the end of the name
const HDR_CLEAR = 3; // header ↔ headshot
const HDR_PANEL_GAP = 1.5; // header ↔ panel

function headerGeo(p: BackThemeProps) {
  const sub = subLine(p).toUpperCase();
  const team = teamOrPlaceholder(p).toUpperCase();
  // Right end of the whole block (plate + its pinstripe).
  const end = p.headshot ? p.headshot.left - HDR_CLEAR : p.W - SAFE;
  const plateR = end - K;
  // Accents on the caps (Á, Ñ …) rise above them: start the caps lower so the
  // marks stay SAFE from the top trim.
  const lift = accentLift(team, 1);
  // Everything under the plate (tab, or just the pinstripe) clears the panel.
  const under = sub ? TAB_T : K;
  const base = Math.min(HDR_TEAM, (p.panelTop - HDR_PANEL_GAP - under - HDR_END_PAD - HDR_CAP_TOP) / (CAP_H + lift));
  const capTop = HDR_CAP_TOP + lift * base;
  const plateB = capTop + CAP_H * base + HDR_END_PAD;
  const teamF = fit(team, base, plateR - HDR_END_PAD - HDR_TEXT_X, FONT_EM.anton, TEAM_LS);
  // A shrunk name keeps its caps centered where the full-size caps would sit.
  const capMid = capTop + (CAP_H * base) / 2;
  const teamTop = capMid - (CAP_TOP + CAP_H / 2) * teamF;
  const tabStartPad = BLEED + HDR_TEXT_X;
  const tabEndPad = 1.6 + TAB_CUT;
  const subF = fit(sub || " ", SUB_F, plateR - HDR_TEXT_X - tabEndPad, FONT_EM.sans, SUB_LS);
  return { sub, plateR, plateB, team, teamF, teamTop, tabStartPad, tabEndPad, subF };
}

function Header({ p }: { p: BackThemeProps }) {
  const g = headerGeo(p);
  const { u, palette } = p;
  return (
    <div style={abs({ left: 0, top: 0, width: u(g.plateR + K), height: u(g.plateB + TAB_T), ...shadow(p, plateShadow(p)) })}>
      {/* Secondary pinstripe along the plate's two inner edges (under it). */}
      <div
        style={abs({
          left: u(-BLEED),
          top: u(g.plateB - 0.5),
          width: u(g.plateR + K + BLEED),
          height: u(K + 0.5),
          background: palette.subBackground,
        })}
      />
      <div
        style={abs({
          left: u(g.plateR - 0.5),
          top: u(-BLEED),
          width: u(K + 0.5),
          height: u(g.plateB + K + BLEED),
          background: palette.subBackground,
        })}
      />
      {g.sub && (
        <div
          style={abs({
            left: u(-BLEED),
            top: u(g.plateB),
            width: "max-content",
            whiteSpace: "nowrap",
            ...subTabStyle(p, g.subF, g.tabStartPad, g.tabEndPad),
          })}
        >
          {g.sub}
        </div>
      )}
      <div
        style={abs({
          left: u(-BLEED),
          top: u(-BLEED),
          width: u(g.plateR + BLEED),
          height: u(g.plateB + BLEED),
          background: palette.background,
        })}
      />
      <div style={abs({ left: u(HDR_TEXT_X), top: u(g.teamTop), whiteSpace: "nowrap", ...teamNameStyle(p, g.teamF) })}>
        {g.team}
      </div>
    </div>
  );
}

// ── Sheet colors ─────────────────────────────────────────────────────────────

const INK = "#0a0a0a";
const FILM = 0.86; // how much of the primary the dark film hides
const WHITE = "#ffffff";
const MUTED = "rgba(255,255,255,0.62)";

function mixHex(a: string, b: string, t: number): string {
  const rgb = (h: string) => {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(h.trim());
    if (!m) return [0, 0, 0];
    const s = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
    const n = parseInt(s, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

// The sheet: the primary under a near-black film — dark enough for white text
// with any team color, still tinted by it.
function sheet(p: BackThemeProps) {
  return mixHex(p.palette.background, INK, FILM);
}

// Team color for thin rules (min 3:1) and small labels (min 4.5:1) ON the
// sheet: the brighter of the two, when it reads there; otherwise muted white.
function accent(p: BackThemeProps, min = 3): string {
  const { background: a, subBackground: b } = p.palette;
  const c = luminance(a) >= luminance(b) ? a : b;
  return contrast(c, sheet(p)) >= min ? c : MUTED;
}
const accentText = (p: BackThemeProps) => accent(p, 4.5);

// The front's hard secondary offset, for white text on the sheet — only when
// the secondary shows against the sheet and the text.
function sheetPop(p: BackThemeProps, em = 0.055): string | undefined {
  const s = p.palette.subBackground;
  return contrast(s, sheet(p)) >= 1.8 && contrast(s, WHITE) >= 1.4 ? `${em}em ${em}em 0 ${s}` : undefined;
}

// ── Panel frame (u) ──────────────────────────────────────────────────────────
// Drawn in the panel's padding (≥ 3.36u in every layout), so it costs the
// content no room: primary band, secondary pinstripe, then the sheet.
const BAND = 1.25;
const RULE = 0.5;

// ── Small pieces ─────────────────────────────────────────────────────────────

const LABEL_F = 1.7; // every small caps label on the sheet

function capsLabel(p: BackThemeProps, size = LABEL_F, ls = 0.16): CSSProperties {
  return {
    fontFamily: FONTS.sans,
    fontWeight: 800,
    fontSize: p.u(size),
    letterSpacing: `${ls}em`,
    lineHeight: 1,
    whiteSpace: "nowrap",
  };
}

// A primary tab with the front's angled end, sitting on a full-width rule.
function TabOnRule({ p, text, rule, mb }: { p: BackThemeProps; text: string; rule: string; mb: number }) {
  const { u, palette } = p;
  const L = p.landscape;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", marginBottom: u(mb) }}>
      <div
        style={{
          ...capsLabel(p, L ? 1.6 : LABEL_F, 0.2),
          background: palette.background,
          color: palette.color,
          padding: L ? `${u(0.42)} ${u(0.9 + 1.5)} ${u(0.34)} ${u(0.9)}` : `${u(0.5)} ${u(1 + 1.6)} ${u(0.4)} ${u(1)}`,
          clipPath: `polygon(0 0, 100% 0, calc(100% - ${u(1.6)}) 100%, 0 100%)`,
        }}
      >
        {text}
      </div>
      <div style={{ alignSelf: "stretch", height: u(0.3), background: rule }} />
    </div>
  );
}

// Jersey tab (u): Anton digits after a small "#", with side padding. Its
// width feeds the name's font fallback.
const JERSEY_PAD_X = 1.1;
const jerseyTabSize = (landscape: boolean) => (landscape ? 4.8 : 5.2);
function jerseyTabW(landscape: boolean, num: string): number {
  // "#" at 0.46em (≈0.6em glyph) + its 0.04em gap, then the digits.
  return 2 * JERSEY_PAD_X + jerseyTabSize(landscape) * (0.32 + [...num].length * (FONT_EM.anton + 0.02));
}

export const sidebarBack: BackTheme = {
  header: (p) => <Header p={p} />,

  headshot: (p) => {
    const ring = p.palette.background;
    // The exporter strokes the ring at 6.4% of the circle; match it live.
    const w = (p.headshot?.size ?? 22) * 0.064;
    const s = p.palette.subBackground;
    const popShadow = contrast(s, ring) >= 1.25 ? `drop-shadow(${p.u(0.9)} ${p.u(0.9)} 0 ${s}) ` : "";
    return {
      style: {
        border: `${p.u(w)} solid ${ring}`,
        // drop-shadow (never box-shadow) on the round element.
        ...(p.compact ? {} : { filter: `${popShadow}drop-shadow(0 2px 7px rgba(0,0,0,0.38))` }),
      },
      ring,
    };
  },

  panel: (p) => {
    const { u, palette } = p;
    const solid = (c: string) => `linear-gradient(${c}, ${c})`;
    const inset = (n: number) => `calc(100% - ${u(2 * n)}) calc(100% - ${u(2 * n)})`;
    return {
      // Top to bottom: the sheet, the pinstripe ring, the primary band.
      background: [
        `${solid(sheet(p))} center / ${inset(BAND + RULE)} no-repeat`,
        `${solid(palette.subBackground)} center / ${inset(BAND)} no-repeat`,
        palette.background,
      ].join(", "),
      borderRadius: 0,
      color: WHITE,
      fontFamily: FONTS.sans,
      // The layout's em gaps (Q&A grid, coach columns) follow the card, not the
      // page's font size, and stay tighter than Classic's.
      fontSize: u(2.4),
      lineHeight: 1.2,
    };
  },

  name: (p) => ({
    // A wide pick (Bungee, Black Ops …) steps down to Anton / Bebas when the
    // name would not fit beside the jersey tab.
    fontFamily: backNameFamily(p, { jerseyW: jerseyTabW(p.landscape, p.jersey), letterSpacing: 0.03 }),
    fontStyle: p.nameItalic ? "italic" : "normal",
    letterSpacing: "0.03em",
    lineHeight: p.variant === "duo" ? 1.05 : p.landscape ? 1.02 : 1,
    color: WHITE,
    textTransform: "uppercase",
    textShadow: sheetPop(p),
  }),

  // A small copy of the front's jersey tab: primary square, pinstripe under it.
  jersey: (p, num) => (
    <div
      style={{
        flex: "0 0 auto",
        display: "flex",
        alignItems: "baseline",
        background: p.palette.background,
        color: p.palette.color,
        borderBottom: `${p.u(0.6)} solid ${p.palette.subBackground}`,
        padding: `${p.u(0.6)} ${p.u(JERSEY_PAD_X)} ${p.u(0.4)}`,
        fontFamily: FONTS.anton,
        fontWeight: 400,
        fontSize: p.u(jerseyTabSize(p.landscape)),
        lineHeight: 1,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
        textShadow: pop(p, 0.06),
      }}
    >
      <JerseyDigits num={num} />
    </div>
  ),

  // One column of a stat table: primary head over a pinstripe, value below.
  stat: (p, k, v) => (
    <div style={{ minWidth: 0, display: "flex", flexDirection: "column", background: "rgba(255,255,255,0.08)" }}>
      <div
        style={{
          ...capsLabel(p),
          background: p.palette.background,
          color: p.palette.color,
          borderBottom: `${p.u(0.4)} solid ${p.palette.subBackground}`,
          padding: `${p.u(0.5)} 0 ${p.u(0.4)}`,
          textAlign: "center",
          textIndent: "0.16em", // balance the trailing letter-spacing
        }}
      >
        {k}
      </div>
      <div
        style={{
          fontFamily: FONTS.anton,
          fontSize: p.u(v.length > 4 ? 2.9 : 3.7),
          lineHeight: 1,
          padding: `${p.u(v.length > 4 ? 0.95 : 0.55)} ${p.u(0.4)} ${p.u(v.length > 4 ? 0.85 : 0.45)}`,
          textAlign: "center",
          color: WHITE,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {v}
      </div>
    </div>
  ),

  label: (p, text) => <TabOnRule p={p} text={text} rule={accent(p)} mb={p.landscape ? 0.5 : 0.7} />,

  // Pull-quote hung off a mini sidebar: primary bar + secondary pinstripe.
  quote: (p, text) => (
    <div style={{ display: "flex", alignItems: "stretch" }}>
      <div style={{ flex: `0 0 ${p.u(0.9)}`, background: p.palette.background }} />
      <div style={{ flex: `0 0 ${p.u(0.45)}`, background: p.palette.subBackground, marginRight: p.u(1.5) }} />
      <p
        style={{
          margin: 0,
          fontSize: p.u(p.landscape ? 2.7 : 3),
          lineHeight: p.landscape ? 1.22 : 1.25,
          fontStyle: "italic",
          fontWeight: 600,
          color: WHITE,
        }}
      >
        &ldquo;{text}&rdquo;
      </p>
    </div>
  ),

  body: (p) => ({
    fontSize: p.u(p.landscape ? 2.6 : 2.75),
    lineHeight: p.landscape ? 1.26 : 1.3,
    fontWeight: 500,
    color: "rgba(255,255,255,0.9)",
    margin: 0,
  }),

  qa: (p, label, value) => {
    const tick: CSSProperties = { borderLeft: `${p.u(0.55)} solid ${accent(p)}`, paddingLeft: p.u(1.2), minWidth: 0 };
    return p.variant === "duo" ? (
      <div style={{ ...tick, display: "flex", flexDirection: "column", gap: p.u(0.6) }}>
        <span style={{ ...capsLabel(p, 2.3, 0.14), whiteSpace: "normal", textTransform: "uppercase", color: accentText(p) }}>
          {label}
        </span>
        <span style={{ fontSize: p.u(3.6), lineHeight: 1.2, fontWeight: 600, color: WHITE }}>{value}</span>
      </div>
    ) : (
      <div style={tick}>
        <div style={{ ...capsLabel(p, p.landscape ? 1.6 : LABEL_F, 0.12), color: MUTED }}>{label}</div>
        <div
          style={{
            fontSize: p.u(p.landscape ? 2.55 : 2.75),
            fontWeight: 700,
            lineHeight: p.landscape ? 1.1 : 1.12,
            color: WHITE,
            marginTop: p.u(p.landscape ? 0.25 : 0.3),
            overflowWrap: "anywhere",
          }}
        >
          {value}
        </div>
      </div>
    );
  },

  // A primary band with the pinstripe on top and the label on a secondary tab
  // with the angled end — the front's name band and AGE · SEASON tab.
  match: (p, m) => {
    const duo = p.variant === "duo";
    const L = !duo && p.landscape;
    const { u, palette } = p;
    const photo = m.photos({
      width: duo ? u(10) : L ? "13%" : "14%",
      aspectRatio: "1 / 1",
      flexShrink: 0,
      borderRadius: "9999px",
      // The exporter strokes these rings at 0.6% of the card width.
      border: `${u(0.006 * p.W)} solid ${palette.subBackground}`,
    });
    return (
      <div
        style={{
          ...(duo ? { flex: "0 0 auto" } : {}),
          background: palette.background,
          color: palette.color,
          borderTop: `${u(0.7)} solid ${palette.subBackground}`,
          padding: L ? `${u(0.75)} ${u(1.2)}` : `${u(1.1)} ${u(1.5)}`,
          display: "flex",
          alignItems: "center",
          gap: u(L || duo ? 1.8 : 2),
        }}
      >
        {photo}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <div
            style={{
              ...capsLabel(p, L ? 1.5 : 1.7, 0.2),
              fontWeight: 700,
              background: palette.subBackground,
              color: palette.subColor,
              padding: L ? `${u(0.42)} ${u(0.8 + 1.3)} ${u(0.34)} ${u(0.8)}` : `${u(0.5)} ${u(0.9 + 1.4)} ${u(0.4)} ${u(0.9)}`,
              clipPath: `polygon(0 0, 100% 0, calc(100% - ${u(L ? 1.3 : 1.4)}) 100%, 0 100%)`,
              marginBottom: u(L ? 0.4 : 0.6),
            }}
          >
            {m.label}
          </div>
          <div
            style={{
              alignSelf: "stretch",
              fontFamily: FONTS.anton,
              fontSize: u(duo ? 4.2 : L ? 4.3 : 4.9),
              lineHeight: 1.02,
              letterSpacing: "0.03em",
              textShadow: pop(p, 0.05),
              ...(duo ? {} : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }),
            }}
          >
            {m.name}
          </div>
          {m.blurb && (
            <p
              style={{
                margin: `${u(L ? 0.35 : 0.45)} 0 0`,
                fontSize: u(L ? 2.1 : 2.3),
                lineHeight: L ? 1.15 : 1.2,
                fontWeight: 600,
                fontStyle: "italic",
                opacity: 0.85,
              }}
            >
              {m.blurb}
            </p>
          )}
        </div>
      </div>
    );
  },

  matchRing: (p) => p.palette.subBackground,

  coach: (p, label, value) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...capsLabel(p), color: accentText(p), marginBottom: p.u(0.5) }}>{label}</div>
      <div
        style={{
          fontFamily: FONTS.anton,
          fontSize: p.u(3.1),
          lineHeight: 1.05,
          letterSpacing: "0.03em",
          textTransform: "uppercase",
          color: WHITE,
        }}
      >
        {value}
      </div>
    </div>
  ),

  // The band's edge: a primary rule with the secondary pinstripe under it.
  divider: (p) => ({
    borderTop: `${p.u(0.5)} solid ${p.palette.background}`,
    backgroundImage: `linear-gradient(${p.palette.subBackground}, ${p.palette.subBackground})`,
    backgroundSize: `100% ${p.u(0.35)}`,
    backgroundPosition: "top",
    backgroundRepeat: "no-repeat",
    paddingTop: p.u(p.variant === "duo" ? 1.4 : p.landscape ? 1.1 : 1.2),
  }),
};
