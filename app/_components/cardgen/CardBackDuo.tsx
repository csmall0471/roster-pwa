import { Fragment, forwardRef, type CSSProperties } from "react";
import { classicBack } from "./front-designs/classic-back";
import { backThemeProps, type BackTheme, type FrontDesignProps } from "./front-designs/shared";

// The duo/trio card back: a shared name plate and a list of fun questions the
// pair/trio answered together (no per-player stat columns). Pure presentational
// and pure DOM (gradient + text), so it composites the same way as the solo
// back — see compositeBack in card-raster.ts. The LAYOUT lives here; the card
// design's BackTheme styles the pieces.

type Props = {
  // Card design styling for the back + shared design inputs. Absent = Classic.
  theme?: BackTheme;
  designProps?: FrontDesignProps;
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
  // Coaching staff (optional) — shown on the group card too.
  coach?: string;
  assistantCoaches?: string;
};

const CardBackDuo = forwardRef<HTMLDivElement, Props>(function CardBackDuo(
  {
    theme = classicBack,
    designProps,
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
    coach,
    assistantCoaches,
  },
  ref
) {
  const p = backThemeProps(designProps, {
    landscape: !!landscape,
    variant: "duo",
    team: teamText,
    age: ageText,
    season: seasonText,
    headshot: null,
    panelTop: landscape ? 22 : 140 * 0.22,
  });
  const matchRing = theme.matchRing(p);

  return (
    <div
      ref={ref}
      className="relative w-full mx-auto rounded-2xl overflow-hidden shadow-lg"
      style={{ aspectRatio: landscape ? "7 / 5" : "5 / 7", ...bgStyle }}
    >
      {/* Header — the design's team block. */}
      {theme.header(p)}

      {/* Content panel — same language as the solo back. */}
      <div
        style={{
          position: "absolute",
          left: "5%",
          right: "5%",
          top: "22%",
          bottom: "5%",
          padding: "5% 5% 4%",
          ...theme.panel(p),
          display: "flex",
          flexDirection: "column",
          gap: "3.5%",
          overflow: "hidden",
        }}
      >
        <div style={{ ...theme.name(p), fontSize: p.u(7) }}>{namesTitle || "THE DUO"}</div>

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
            <Fragment key={i}>{theme.qa(p, q, a)}</Fragment>
          ))}
        </div>

        {/* Coaching staff — a compact footer above the match banner. */}
        {(coach || assistantCoaches) && (
          <div
            style={{
              flex: "0 0 auto",
              display: "flex",
              gap: "7%",
              ...theme.divider(p),
            }}
          >
            {coach && theme.coach(p, "HEAD COACH", coach)}
            {assistantCoaches && theme.coach(p, "ASSISTANTS", assistantCoaches)}
          </div>
        )}

        {/* Duo match — a famous pro pairing, mirroring the solo back's Player
            Match banner. Photos are drawn onto the canvas at export (iOS drops
            raster images from the html-to-image snapshot) via [data-duo-photo]. */}
        {matchName && (
          <div style={{ flex: "0 0 auto" }}>
            {theme.match(p, {
              label: matchLabel,
              name: matchName.toUpperCase(),
              blurb: matchBlurb || undefined,
              photos: (style) =>
                matchPhotos && matchPhotos.length > 0 ? (
                  <div style={{ display: "flex", gap: "0.35em", flexShrink: 0 }}>
                    {matchPhotos.slice(0, 2).map((src, i) => (
                      <div
                        key={i}
                        data-duo-photo
                        data-ring={matchRing}
                        style={{
                          ...style,
                          backgroundImage: `url(${src})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center 22%",
                        }}
                      />
                    ))}
                  </div>
                ) : null,
            })}
          </div>
        )}
      </div>
    </div>
  );
});

export default CardBackDuo;
