// Stamp back — the shipping-label side of the Stamp design. The header is the
// front's tilted, double-ruled team box; the headshot sits in a round seal like
// the front's "NO." jersey stamp; the content panel is one big label plate
// (primary color, outer rule in the other team color, inner rule in the ink)
// filled in like a manifest: double-ruled stat boxes stamped slightly askew,
// stencil section heads trailed by dashed tear lines, "LABEL  value" fields, a
// stamped match banner in the seal colors, and the coaching staff under a
// dashed tear line, as on the front's name label.
//
// Colors come from the front's inks(): plate/ink for the panel, seal/sealInk
// for the filled stamps (jersey seal, match banner, coach tags), rule for the
// thin accents. Text only ever sits on its own contrast-paired surface.

import type { CSSProperties } from "react";
import {
  FONTS,
  FONT_EM,
  SAFE,
  abs,
  backNameFamily,
  fitSize,
  shadow,
  type BackTheme,
  type BackThemeProps,
} from "./shared";
// Attached to the design in ./index.tsx, so this import of ./stamp is one-way.
import { GAP, JERSEY_TILT, R1, R2, TEAM_TILT, Team, inks, sinDeg, teamBox, textEm } from "./stamp";

const SHADOW = "drop-shadow(0 3px 7px rgba(0,0,0,0.4))";

// ── Header ───────────────────────────────────────────────────────────────────

// Headshot seal: outer rule, a seal-colored gap, then the photo's own ring.
const HS_GAP = 0.8;
type Headshot = NonNullable<BackThemeProps["headshot"]>;
// Seal margin around the photo circle (u). The landscape headshot sits just
// above the panel, so there the margin shrinks to end 0.5u clear of it.
const hsMargin = (p: BackThemeProps, hs: Headshot) =>
  Math.max(0, Math.min(R1 + HS_GAP, p.panelTop - 0.5 - (hs.top + hs.size)));
// The exporter strokes the headshot ring at 6.4% of the circle's size.
const HS_RING = 0.064;

function Header({ p }: { p: BackThemeProps }) {
  const sx = 4.5;
  const top = 4;
  const hs = p.headshot;
  // Keep the box 3u clear of the headshot seal (or SAFE from the trim), and
  // 2u above the panel.
  const rightLimit = hs ? hs.left - hsMargin(p, hs) - 3 : p.W - SAFE;
  const maxBottom = p.panelTop - 2;
  // The box tilts about its top-right corner, so its lowest point is the
  // bottom-left corner: h·cos + w·sin below the top. Where that runs into the
  // panel (the group landscape back), the whole box is scaled down: its
  // geometry is computed in virtual units of 1/k u and drawn with u·k.
  const sin = sinDeg(TEAM_TILT);
  const cos = Math.cos((TEAM_TILT * Math.PI) / 180);
  let k = 1;
  let g = teamBox(p, sx, rightLimit);
  for (let i = 0; i < 6; i++) {
    const depth = k * (g.teamH * cos + g.teamW * sin);
    if (top + depth <= maxBottom + 0.01) break;
    k *= (maxBottom - top) / depth;
    g = teamBox(p, sx / k, rightLimit / k);
  }
  const pk = k === 1 ? p : { ...p, u: (n: number) => p.u(+(n * k).toFixed(3)) };

  return (
    <>
      <Team p={pk} l={{ ...g, top: top / k, sx: sx / k }} />
      {hs && <HeadshotSeal p={p} hs={hs} />}
    </>
  );
}

// Round seal behind the headshot (the photo element is drawn on top of it).
function HeadshotSeal({ p, hs }: { p: BackThemeProps; hs: Headshot }) {
  const c = inks(p);
  const m = hsMargin(p, hs);
  // A clamped margin keeps the rule-to-gap proportion.
  const rule = (m * R1) / (R1 + HS_GAP);
  return (
    <div
      style={abs({
        left: p.u(hs.left - m),
        top: p.u(hs.top - m),
        width: p.u(hs.size + 2 * m),
        height: p.u(hs.size + 2 * m),
        borderRadius: "9999px",
        background: c.seal,
        border: `${p.u(rule)} solid ${c.sealRule}`,
        boxSizing: "border-box",
        ...shadow(p, SHADOW),
      })}
    />
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

// Inner rule of a double-ruled square box, drawn as inset shadows (fine on
// square corners): a plate-colored gap, then the inner rule.
function innerRule(p: BackThemeProps, plate: string, ink: string, gap: number, rule: number): CSSProperties {
  return { boxShadow: `inset 0 0 0 ${p.u(gap)} ${plate}, inset 0 0 0 ${p.u(gap + rule)} ${ink}` };
}

// Dashed tear line (a gradient, so the dash length is set in u).
function tear(p: BackThemeProps, color: string, dash = 1.1, space = 0.8): CSSProperties {
  return {
    height: p.u(R2),
    backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 ${p.u(dash)}, transparent ${p.u(dash)} ${p.u(dash + space)})`,
  };
}

// Small caps for field labels.
function caps(p: BackThemeProps, size: number, ls = 0.14): CSSProperties {
  return { fontFamily: FONTS.sans, fontWeight: 800, fontSize: p.u(size), letterSpacing: `${ls}em`, lineHeight: 1 };
}

// Stat boxes are stamped slightly askew, each its own way.
const STAT_TILT: Record<string, number> = { POS: -1.5, HT: 1, "#": -1, AGE: 1.5 };

// Jersey seal diameter (u).
const jerseyD = (p: BackThemeProps) => (p.landscape ? 8 : 8.2);
const NAME_LS = 0.02; // panel name letter spacing (em)

// ── Theme ────────────────────────────────────────────────────────────────────

export const stampBack: BackTheme = {
  header: (p) => <Header p={p} />,

  headshot: (p) => {
    const c = inks(p);
    const w = (p.headshot?.size ?? 22) * HS_RING;
    return {
      style: { border: `${p.u(w)} solid ${c.sealInk}`, boxSizing: "border-box" },
      ring: c.sealInk,
    };
  },

  // One big label plate: outer rule in the other team color, a plate gap and
  // the inner rule in the ink. Square corners, so the inner rule can be an
  // inset shadow. The font size makes the layout's em gaps scale with the card.
  panel: (p) => {
    const c = inks(p);
    return {
      background: c.plate,
      color: c.ink,
      border: `${p.u(R1)} solid ${c.rule}`,
      borderRadius: 0,
      ...innerRule(p, c.plate, c.ink, GAP, R2),
      fontFamily: FONTS.sans,
      fontSize: p.u(2.4),
      ...shadow(p, SHADOW),
    };
  },

  name: (p) => ({
    // Falls back to Anton/Bebas when the user's font would cut the name off.
    fontFamily: backNameFamily(p, { jerseyW: jerseyD(p), letterSpacing: NAME_LS }),
    fontStyle: p.nameItalic ? "italic" : "normal",
    letterSpacing: `${NAME_LS}em`,
    lineHeight: p.variant === "duo" ? 1.05 : 1,
    color: inks(p).ink,
    textTransform: "uppercase",
  }),

  // A small "NO." seal, like the front's jersey stamp.
  jersey: (p, num) => {
    const c = inks(p);
    const D = jerseyD(p);
    const size = fitSize(num, D * 0.46, D * 0.6, textEm(num, FONT_EM.stencil), 0.02);
    return (
      <div
        style={{
          alignSelf: p.landscape ? "flex-start" : "center",
          flex: "0 0 auto",
          position: "relative",
          width: p.u(D),
          height: p.u(D),
          borderRadius: "9999px",
          background: c.seal,
          border: `${p.u(R1)} solid ${c.sealRule}`,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: p.u(0.35),
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
          <div style={{ ...caps(p, 1.4, 0.2), paddingLeft: "0.2em" }}>NO.</div>
          <div style={{ fontFamily: FONTS.stencil, fontSize: p.u(size), letterSpacing: "0.02em", lineHeight: 1, marginTop: p.u(0.2) }}>
            {num}
          </div>
        </div>
      </div>
    );
  },

  // Double-ruled stamped box: label caps over a stencil value.
  stat: (p, k, v) => {
    const c = inks(p);
    const val = v.toUpperCase();
    const room = p.landscape ? 13 : 13.5; // text room inside the box (u)
    return (
      <div
        style={{
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: p.u(0.45),
          border: `${p.u(0.42)} solid ${c.rule}`,
          ...innerRule(p, c.plate, c.ink, 0.3, 0.18),
          padding: `${p.u(0.9)} ${p.u(0.8)} ${p.u(0.8)}`,
          transform: `rotate(${STAT_TILT[k] ?? 0}deg)`,
        }}
      >
        <div style={{ ...caps(p, 1.6, 0.2), paddingLeft: "0.2em", opacity: 0.8 }}>{k}</div>
        <div
          style={{
            fontFamily: FONTS.stencil,
            fontSize: p.u(fitSize(val, 3.5, room, textEm(val, FONT_EM.stencil), 0.02)),
            letterSpacing: "0.02em",
            lineHeight: 1,
            whiteSpace: "nowrap",
            maxWidth: "100%",
            overflow: "hidden",
          }}
        >
          {val}
        </div>
      </div>
    );
  },

  // Stencil heading trailed by a dashed tear line.
  label: (p, text) => {
    const c = inks(p);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: p.u(1.2), marginBottom: p.u(p.landscape ? 0.7 : 0.8) }}>
        <span style={{ fontFamily: FONTS.stencil, fontSize: p.u(2.1), letterSpacing: "0.08em", lineHeight: 1, whiteSpace: "nowrap" }}>
          {text}
        </span>
        <span style={{ flex: "1 1 auto", ...tear(p, c.ink) }} />
      </div>
    );
  },

  // Double rule down the left (team color, then ink), as on the plates.
  quote: (p, text) => {
    const c = inks(p);
    return (
      <div style={{ borderLeft: `${p.u(R1 + 0.2)} solid ${c.rule}`, paddingLeft: p.u(GAP) }}>
        <div style={{ borderLeft: `${p.u(R2)} solid ${c.ink}`, paddingLeft: p.u(1.4) }}>
          <p style={{ fontSize: p.u(2.8), lineHeight: 1.28, fontWeight: 700, fontStyle: "italic", margin: 0 }}>&ldquo;{text}&rdquo;</p>
        </div>
      </div>
    );
  },

  body: (p) => ({
    fontSize: p.u(2.7),
    lineHeight: p.landscape ? 1.3 : 1.32,
    fontWeight: 600,
    margin: 0,
  }),

  qa: (p, label, value) => {
    const c = inks(p);
    return p.variant === "duo" ? (
      // The group back lists a few longer answers: a stencil question with a
      // tear line, the answer under it.
      <div style={{ display: "flex", flexDirection: "column", gap: p.u(0.8) }}>
        <div style={{ display: "flex", alignItems: "center", gap: p.u(1) }}>
          <span style={{ fontFamily: FONTS.stencil, fontSize: p.u(2.3), letterSpacing: "0.06em", lineHeight: 1, textTransform: "uppercase" }}>
            {label}
          </span>
          <span style={{ flex: "1 1 auto", minWidth: p.u(4), ...tear(p, c.ink) }} />
        </div>
        <span style={{ fontSize: p.u(3.4), fontWeight: 700, lineHeight: 1.2 }}>{value}</span>
      </div>
    ) : (
      // Manifest field: a fixed label column, the answer beside it.
      <div style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: p.u(0.8) }}>
        <span
          style={{
            ...caps(p, fitSize(label, p.landscape ? 1.5 : 1.6, (p.landscape ? 12.8 : 13.6) - 0.4, FONT_EM.sans, 0.12), 0.12),
            flex: `0 0 ${p.u(p.landscape ? 12.8 : 13.6)}`,
            whiteSpace: "nowrap",
            opacity: 0.75,
          }}
        >
          {label}
        </span>
        <span style={{ flex: "1 1 auto", minWidth: 0, fontSize: p.u(p.landscape ? 2.55 : 2.7), fontWeight: 700, lineHeight: 1.15, overflowWrap: "anywhere" }}>
          {value}
        </span>
      </div>
    );
  },

  // A stamped label in the seal colors: double rule, the photo(s) in the
  // seal's ink ring, and a small tilted match stamp over the name.
  match: (p, m) => {
    const duo = p.variant === "duo";
    const L = !duo && p.landscape;
    const c = inks(p);
    return (
      <div
        style={{
          ...(duo ? { flex: "0 0 auto" } : {}),
          display: "flex",
          flexDirection: "column",
          background: c.seal,
          border: `${p.u(R1)} solid ${c.sealRule}`,
          padding: p.u(GAP),
          boxSizing: "border-box",
          color: c.sealInk,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: p.u(L ? 1.5 : 1.8),
            border: `${p.u(R2)} solid ${c.sealInk}`,
            padding: L ? `${p.u(0.8)} ${p.u(1.1)}` : `${p.u(0.9)} ${p.u(1.3)}`,
          }}
        >
          {m.photos({
            width: p.u(duo ? 9.5 : L ? 9.5 : 10),
            aspectRatio: "1 / 1",
            flexShrink: 0,
            borderRadius: "9999px",
            // The exporter strokes this ring at 0.6% of the trim width.
            border: `${p.u(0.006 * p.W)} solid ${c.sealInk}`,
            boxSizing: "border-box",
          })}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <div
              style={{
                ...caps(p, L ? 1.5 : 1.6, 0.22),
                border: `${p.u(R2)} solid ${c.sealInk}`,
                padding: `${p.u(0.34)} ${p.u(0.55)} ${p.u(0.28)}`,
                whiteSpace: "nowrap",
                transform: "rotate(-3deg)",
                transformOrigin: "left center",
                marginBottom: p.u(0.5),
              }}
            >
              {m.label}
            </div>
            <div
              style={{
                maxWidth: "100%",
                fontFamily: FONTS.stencil,
                fontSize: p.u(duo ? 3.6 : L ? 3.8 : 4.2),
                letterSpacing: "0.03em",
                lineHeight: 1,
                ...(duo ? {} : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }),
              }}
            >
              {m.name}
            </div>
            {m.blurb && (
              <p style={{ margin: `${p.u(0.35)} 0 0`, fontSize: p.u(L ? 2.2 : 2.3), lineHeight: 1.2, fontWeight: 600, opacity: 0.9 }}>
                {m.blurb}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  },

  matchRing: (p) => inks(p).sealInk,

  // A filled tag over the stamped name.
  coach: (p, label, value) => {
    const c = inks(p);
    return (
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: p.u(0.6) }}>
        <span
          style={{
            ...caps(p, p.landscape ? 1.45 : 1.55, 0.18),
            background: c.seal,
            color: c.sealInk,
            border: `${p.u(R2)} solid ${c.sealRule}`,
            padding: `${p.u(0.42)} ${p.u(0.65)} ${p.u(0.36)}`,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: FONTS.stencil,
            fontSize: p.u(p.variant === "duo" || p.landscape ? 2.6 : 2.8),
            letterSpacing: "0.03em",
            lineHeight: 1.06,
            textTransform: "uppercase",
          }}
        >
          {value}
        </span>
      </div>
    );
  },

  // The front's tear line above the coaches.
  divider: (p) => ({
    borderTop: `${p.u(R2)} dashed ${inks(p).ink}`,
    paddingTop: p.u(p.variant === "duo" ? 2 : p.landscape ? 1.3 : 1.4),
  }),
};
