// Classic back — the original card back: white/black chevron chips, a
// translucent dark panel, amber accents. With no colors picked it must render
// exactly like backs made before card designs existed.

import { FONTS, type BackTheme, type BackThemeProps } from "./shared";

const AMBER = "#fbbf24";
const MATCH_BG = "linear-gradient(90deg, rgba(251,191,36,0.95) 0%, rgba(251,146,60,0.95) 100%)";

export function ClassicBackHeader({ p }: { p: BackThemeProps }) {
  const sub = [p.age, p.season].filter(Boolean).join(" · ");
  return (
    <div
      style={{
        position: "absolute",
        top: "6.5%",
        left: 0,
        pointerEvents: "none",
        filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.45))",
      }}
    >
      <div
        style={{
          background: p.palette.background,
          color: p.palette.color,
          padding: `0.38em 1.6em 0.38em ${p.u(9)}`,
          clipPath: "polygon(0 0, 100% 0, calc(100% - 0.8em) 100%, 0 100%)",
          fontFamily: FONTS.anton,
          fontSize: p.u(7),
          letterSpacing: "0.04em",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        {p.team || "TEAM"}
      </div>
      {sub && (
        <div
          style={{
            background: p.palette.subBackground,
            color: p.palette.subColor,
            padding: `0.45em 1.6em 0.45em ${p.u(9)}`,
            clipPath: "polygon(0 0, 100% 0, calc(100% - 0.7em) 100%, 0 100%)",
            fontFamily: FONTS.sans,
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
    </div>
  );
}

export const classicBack: BackTheme = {
  header: (p) => <ClassicBackHeader p={p} />,

  headshot: () => ({
    style: {
      border: "3px solid rgba(255,255,255,0.92)",
      // drop-shadow (not box-shadow): box-shadow on a round element
      // rasterizes to a rectangular shadow through html-to-image.
      filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.45))",
    },
    ring: "rgba(255,255,255,0.92)",
  }),

  panel: () => ({
    background: "rgba(0,0,0,0.62)",
    borderRadius: "14px",
    color: "#fff",
    fontFamily: FONTS.sans,
  }),

  name: (p) =>
    p.variant === "duo"
      ? { fontFamily: FONTS.anton, letterSpacing: "0.03em", lineHeight: 1.05, color: "#fff", textTransform: "uppercase" }
      : p.landscape
        ? { fontFamily: FONTS.anton, letterSpacing: "0.02em", lineHeight: 1.02 }
        : { fontFamily: FONTS.anton, letterSpacing: "0.04em", lineHeight: 1 },

  jersey: (p, num) => (
    <span
      style={{
        fontFamily: FONTS.anton,
        fontSize: p.u(p.landscape ? 7 : 8),
        color: AMBER,
        lineHeight: 1,
      }}
    >
      #{num}
    </span>
  ),

  stat: (p, k, v) => (
    <div
      style={{
        background: "rgba(255,255,255,0.12)",
        borderRadius: "8px",
        padding: "0.5em 0.3em",
        textAlign: "center",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: p.u(1.9),
          letterSpacing: "0.18em",
          color: "rgba(255,255,255,0.55)",
          fontWeight: 700,
        }}
      >
        {k}
      </div>
      <div
        style={{
          fontFamily: FONTS.anton,
          // Shrink so longer values (e.g. an un-abbreviated position or a tall
          // height like 5'11") stay on one line inside the pill.
          fontSize: v.length > 4 ? p.u(3) : p.u(4.2),
          lineHeight: 1.1,
          marginTop: "2px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {v}
      </div>
    </div>
  ),

  label: (p, text) => (
    <div
      style={{
        fontSize: p.u(p.landscape ? 1.9 : 2),
        letterSpacing: "0.22em",
        color: "rgba(255,255,255,0.55)",
        fontWeight: 700,
        marginBottom: p.landscape ? "0.35em" : "0.4em",
      }}
    >
      {text}
    </div>
  ),

  quote: (p, text) => (
    <div style={{ borderLeft: `3px solid ${AMBER}`, paddingLeft: "0.7em" }}>
      <p
        style={{
          fontSize: p.u(p.landscape ? 2.9 : 3.1),
          lineHeight: p.landscape ? 1.3 : 1.35,
          fontStyle: "italic",
          fontWeight: 600,
          color: "#fff",
          margin: 0,
        }}
      >
        &ldquo;{text}&rdquo;
      </p>
    </div>
  ),

  body: (p) => ({
    fontSize: p.u(p.landscape ? 2.8 : 2.9),
    lineHeight: p.landscape ? 1.35 : 1.4,
    fontStyle: "italic",
    color: "rgba(255,255,255,0.92)",
    margin: 0,
  }),

  qa: (p, label, value) =>
    p.variant === "duo" ? (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.15em" }}>
        <span
          style={{
            fontSize: p.u(2.7),
            letterSpacing: "0.14em",
            fontWeight: 700,
            textTransform: "uppercase",
            color: AMBER,
            lineHeight: 1,
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: p.u(3.9), lineHeight: 1.2, color: "#fff" }}>{value}</span>
      </div>
    ) : (
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: p.u(1.85),
            letterSpacing: "0.12em",
            color: "rgba(255,255,255,0.5)",
            fontWeight: 700,
            lineHeight: 1.1,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: p.u(2.9),
            fontWeight: 600,
            color: "#fff",
            lineHeight: 1.2,
            overflowWrap: "anywhere",
          }}
        >
          {value}
        </div>
      </div>
    ),

  match: (p, m) => {
    const duo = p.variant === "duo";
    const L = !duo && p.landscape;
    return (
      <div
        style={{
          ...(duo ? { flex: "0 0 auto" } : {}),
          background: MATCH_BG,
          color: "#0a0a0a",
          borderRadius: "10px",
          padding: L ? "0.6em 0.8em" : "0.7em 0.9em",
          display: "flex",
          alignItems: "center",
          gap: duo || L ? "0.7em" : "0.8em",
        }}
      >
        {m.photos({
          width: duo ? p.u(11) : L ? "14%" : "16%",
          aspectRatio: "1 / 1",
          flexShrink: 0,
          borderRadius: "9999px",
          border: "2px solid rgba(10,10,10,0.55)",
        })}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: p.u(L ? 1.9 : 2),
              letterSpacing: "0.22em",
              fontWeight: 800,
              color: "rgba(10,10,10,0.6)",
              marginBottom: L ? "0.12em" : "0.15em",
            }}
          >
            {m.label}
          </div>
          <div
            style={
              duo
                ? { fontFamily: FONTS.anton, fontSize: p.u(4.4), lineHeight: 1.02, letterSpacing: "0.02em" }
                : {
                    fontFamily: FONTS.anton,
                    fontSize: p.u(L ? 5 : 5.5),
                    lineHeight: 1,
                    letterSpacing: "0.03em",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }
            }
          >
            {m.name}
          </div>
          {m.blurb && (
            <p
              style={{
                margin: L ? "0.25em 0 0" : "0.3em 0 0",
                fontSize: p.u(L ? 2.3 : 2.5),
                lineHeight: L ? 1.2 : 1.25,
                fontWeight: 600,
                fontStyle: "italic",
                color: "rgba(10,10,10,0.82)",
              }}
            >
              {m.blurb}
            </p>
          )}
        </div>
      </div>
    );
  },

  matchRing: () => "rgba(10,10,10,0.55)",

  coach: (p, label, value) => (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: p.u(2),
          letterSpacing: "0.16em",
          color: AMBER,
          fontWeight: 700,
          marginBottom: "0.2em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: FONTS.anton,
          fontSize: p.u(p.variant === "duo" ? 3.4 : 3.8),
          lineHeight: 1.05,
          letterSpacing: "0.02em",
          color: "#fff",
        }}
      >
        {value}
      </div>
    </div>
  ),

  divider: (p) =>
    p.variant === "duo"
      ? { borderTop: "1px solid rgba(255,255,255,0.18)", paddingTop: "3%" }
      : { borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: p.landscape ? "0.6em" : "0.7em" },
};
