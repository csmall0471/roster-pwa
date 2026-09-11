import { forwardRef, type CSSProperties } from "react";

// The duo/trio card back: a shared name plate and a list of fun questions the
// pair/trio answered together (no per-player stat columns). Pure presentational
// and pure DOM (gradient + text), so it composites the same way as the solo
// back — see compositeBack in card-raster.ts.

type Props = {
  bgStyle: CSSProperties;
  landscape?: boolean;
  teamText: string;
  ageText: string;
  seasonText: string;
  namesTitle: string; // "CJ & ALEX"
  items: { q: string; a: string }[]; // already filtered to answered questions
  // Optional "duo match" — a famous pro pairing this duo plays like.
  matchName?: string;
  matchBlurb?: string;
  matchPhotos?: string[]; // up to 2 pro photos (drawn on the canvas at export)
  matchLabel?: string; // section header, e.g. "DUO MATCH" / "SQUAD MATCH"
};

const CardBackDuo = forwardRef<HTMLDivElement, Props>(function CardBackDuo(
  {
    bgStyle,
    landscape,
    teamText,
    ageText,
    seasonText,
    namesTitle,
    items,
    matchName,
    matchBlurb,
    matchPhotos,
    matchLabel = "DUO MATCH",
  },
  ref
) {
  return (
    <div
      ref={ref}
      className="relative w-full mx-auto rounded-2xl overflow-hidden shadow-lg"
      style={{ aspectRatio: landscape ? "7 / 5" : "5 / 7", ...bgStyle }}
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
          overflow: "hidden",
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

        <div
          style={{
            display: "grid",
            gridTemplateColumns: landscape ? "1fr 1fr" : "1fr",
            columnGap: "6%",
            rowGap: landscape ? "4%" : "3%",
            alignContent: "start",
            flex: "1 1 auto",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
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

        {/* Duo match — a famous pro pairing, mirroring the solo back's Player
            Match banner. Photos are drawn onto the canvas at export (iOS drops
            raster images from the html-to-image snapshot) via [data-duo-photo]. */}
        {matchName && (
          <div
            style={{
              flex: "0 0 auto",
              background:
                "linear-gradient(90deg, rgba(251,191,36,0.95) 0%, rgba(251,146,60,0.95) 100%)",
              color: "#0a0a0a",
              borderRadius: "10px",
              padding: "0.7em 0.9em",
              display: "flex",
              alignItems: "center",
              gap: "0.7em",
            }}
          >
            {matchPhotos && matchPhotos.length > 0 && (
              <div style={{ display: "flex", gap: "0.35em", flexShrink: 0 }}>
                {matchPhotos.slice(0, 2).map((p, i) => (
                  <div
                    key={i}
                    data-duo-photo
                    style={{
                      width: "calc(var(--cardw, 22rem) * 11 / 100)",
                      aspectRatio: "1 / 1",
                      borderRadius: "9999px",
                      backgroundImage: `url(${p})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center 22%",
                      border: "2px solid rgba(10,10,10,0.55)",
                    }}
                  />
                ))}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: "calc(var(--cardw, 22rem) * 2 / 100)",
                  letterSpacing: "0.22em",
                  fontWeight: 800,
                  color: "rgba(10,10,10,0.6)",
                  marginBottom: "0.15em",
                }}
              >
                {matchLabel}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-anton), Impact, sans-serif",
                  fontSize: "calc(var(--cardw, 22rem) * 4.4 / 100)",
                  lineHeight: 1.02,
                  letterSpacing: "0.02em",
                }}
              >
                {matchName.toUpperCase()}
              </div>
              {matchBlurb && (
                <p
                  style={{
                    margin: "0.3em 0 0",
                    fontSize: "calc(var(--cardw, 22rem) * 2.5 / 100)",
                    lineHeight: 1.25,
                    fontWeight: 600,
                    fontStyle: "italic",
                    color: "rgba(10,10,10,0.82)",
                  }}
                >
                  {matchBlurb}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default CardBackDuo;
