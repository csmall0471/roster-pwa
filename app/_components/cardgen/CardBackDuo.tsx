import { forwardRef, type CSSProperties } from "react";

// The duo/trio card back: a shared name plate and a list of fun questions the
// pair/trio answered together (no per-player stat columns). Pure presentational
// and pure DOM (gradient + text), so it composites the same way as the solo
// back — see compositeBack in card-raster.ts.

type Props = {
  bgStyle: CSSProperties;
  teamText: string;
  ageText: string;
  seasonText: string;
  namesTitle: string; // "CJ & ALEX"
  items: { q: string; a: string }[]; // already filtered to answered questions
};

const CardBackDuo = forwardRef<HTMLDivElement, Props>(function CardBackDuo(
  { bgStyle, teamText, ageText, seasonText, namesTitle, items },
  ref
) {
  return (
    <div
      ref={ref}
      className="relative w-full mx-auto rounded-2xl overflow-hidden shadow-lg"
      style={{ aspectRatio: "5 / 7", ...bgStyle }}
    >
      {/* Header chevron chips — matches the front + solo back. */}
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
            background: "#fff",
            color: "#0a0a0a",
            padding: "0.38em 1.6em 0.38em calc(var(--cardw, 22rem) * 9 / 100)",
            clipPath: "polygon(0 0, 100% 0, calc(100% - 0.8em) 100%, 0 100%)",
            fontFamily: "var(--font-anton), Impact, sans-serif",
            fontSize: "calc(var(--cardw, 22rem) * 7 / 100)",
            letterSpacing: "0.04em",
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          {teamText || "TEAM"}
        </div>
        {(ageText || seasonText) && (
          <div
            style={{
              background: "#0a0a0a",
              color: "#fff",
              padding: "0.45em 1.6em 0.45em calc(var(--cardw, 22rem) * 9 / 100)",
              clipPath: "polygon(0 0, 100% 0, calc(100% - 0.7em) 100%, 0 100%)",
              fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
              fontSize: "calc(var(--cardw, 22rem) * 2.7 / 100)",
              letterSpacing: "0.22em",
              fontWeight: 700,
              marginTop: "-1px",
              whiteSpace: "nowrap",
            }}
          >
            {[ageText, seasonText].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>

      {/* Content panel — semi-transparent dark sheet, same language as the solo back. */}
      <div
        style={{
          position: "absolute",
          left: "5%",
          right: "5%",
          top: "22%",
          bottom: "5%",
          background: "rgba(0,0,0,0.62)",
          borderRadius: "14px",
          padding: "5% 5% 4%",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          gap: "3.5%",
          fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-anton), Impact, sans-serif",
            fontSize: "calc(var(--cardw, 22rem) * 7 / 100)",
            letterSpacing: "0.03em",
            lineHeight: 1.05,
            color: "#fff",
          }}
        >
          {namesTitle || "THE DUO"}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "3%", flex: "1 1 auto" }}>
          {items.map(({ q, a }, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: "0.15em" }}>
              <span
                style={{
                  fontSize: "calc(var(--cardw, 22rem) * 2.7 / 100)",
                  letterSpacing: "0.14em",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "#fbbf24",
                  lineHeight: 1,
                }}
              >
                {q}
              </span>
              <span
                style={{
                  fontSize: "calc(var(--cardw, 22rem) * 3.9 / 100)",
                  lineHeight: 1.2,
                  color: "#fff",
                }}
              >
                {a}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

export default CardBackDuo;
