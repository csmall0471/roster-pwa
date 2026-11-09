import { Fragment, forwardRef, type CSSProperties } from "react";
import { classicBack } from "./front-designs/classic-back";
import { backThemeProps, type BackTheme, type FrontDesignProps } from "./front-designs/shared";
import type { CardSport } from "@/lib/types";
import { abbreviatePositionFor, getSport } from "./sports";

export type BackStats = {
  position: string;
  height: string;
  jersey: string;
  age: string;
  favorite_team: string;
  favorite_player: string;
  signature_move: string;
  favorite_drill: string;
  biggest_fan: string;
  loudest_parent: string;
  hype_song: string;
  coach: string;
  assistant_coaches: string;
};

type Props = {
  // Card design styling for the back (the design's BackTheme) and the shared
  // design inputs (palette, team text, fonts …). Absent = Classic back.
  theme?: BackTheme;
  designProps?: FrontDesignProps;
  bgStyle: CSSProperties;
  sport?: CardSport;
  landscape?: boolean;
  teamText: string;
  ageText: string;
  seasonText: string;
  playerName: string; // full name display, e.g. "CJ SMALL"
  jersey: string;
  stats: BackStats;
  scoutingReport: string;
  seasonQuote?: string;
  lookAlike: string;
  lookAlikePhoto?: string | null; // photo of the matched pro player
  lookAlikeBlurb?: string; // one-line play-style description of the pro
  headshotUrl?: string | null; // small headshot, upper-right
  headshotPosition?: string; // object-position, e.g. "50% 30%"
  onHeadshotPointerDown?: (e: React.PointerEvent) => void;
  onHeadshotPointerMove?: (e: React.PointerEvent) => void;
  onHeadshotPointerUp?: (e: React.PointerEvent) => void;
};

// Used in CardEditor as the back-side stage. Pure presentational — owns no
// state. The LAYOUT lives here (header, headshot, content panel, section order,
// portrait vs landscape columns); the card design's BackTheme styles the
// pieces so the back matches the front.

const CardBack = forwardRef<HTMLDivElement, Props>(function CardBack(
  {
    theme = classicBack,
    designProps,
    bgStyle,
    sport,
    landscape,
    teamText,
    ageText,
    seasonText,
    playerName,
    jersey,
    stats,
    scoutingReport,
    seasonQuote,
    lookAlike,
    lookAlikePhoto,
    lookAlikeBlurb,
    headshotUrl,
    headshotPosition,
    onHeadshotPointerDown,
    onHeadshotPointerMove,
    onHeadshotPointerUp,
  },
  ref
) {
  const qL = getSport(sport).qLabels;
  const statRows: Array<[string, string]> = [
    ["POS", abbreviatePositionFor(sport, stats.position)],
    ["HT", stats.height],
    ["#", jersey || stats.jersey],
    ["AGE", stats.age],
  ].filter(([, v]) => v && v.length > 0) as Array<[string, string]>;

  const L = !!landscape;
  const p = backThemeProps(designProps, {
    landscape: L,
    variant: "solo",
    team: teamText,
    age: ageText,
    season: seasonText,
    // Headshot box: portrait top 3.5% / right 9.5% / 22% wide; landscape
    // top 5% / right 5% / 17% wide.
    headshot: headshotUrl
      ? L
        ? { left: 140 * (1 - 0.05 - 0.17), top: 5, size: 140 * 0.17 }
        : { left: 100 * (1 - 0.095 - 0.22), top: 140 * 0.035, size: 22 }
      : null,
    panelTop: L ? 30 : 140 * 0.22,
  });
  const hs = theme.headshot(p);
  const matchRing = theme.matchRing(p);
  const hasQA = !!(
    stats.favorite_team ||
    stats.favorite_player ||
    stats.signature_move ||
    stats.favorite_drill ||
    stats.biggest_fan ||
    stats.loudest_parent ||
    stats.hype_song
  );
  const qa = (
    <>
      {stats.favorite_team && <Fragment>{theme.qa(p, "FAV TEAM", stats.favorite_team)}</Fragment>}
      {stats.favorite_player && <Fragment>{theme.qa(p, "FAV PLAYER", stats.favorite_player)}</Fragment>}
      {stats.signature_move && <Fragment>{theme.qa(p, qL.signature_move.back, stats.signature_move)}</Fragment>}
      {stats.favorite_drill && <Fragment>{theme.qa(p, qL.favorite_drill.back, stats.favorite_drill)}</Fragment>}
      {stats.biggest_fan && <Fragment>{theme.qa(p, "BIGGEST FAN", stats.biggest_fan)}</Fragment>}
      {stats.loudest_parent && <Fragment>{theme.qa(p, "LOUDEST FAN", stats.loudest_parent)}</Fragment>}
      {stats.hype_song && <Fragment>{theme.qa(p, "HYPE SONG", stats.hype_song)}</Fragment>}
    </>
  );
  const match = lookAlike
    ? theme.match(p, {
        label: "PLAYER MATCH",
        name: lookAlike.toUpperCase(),
        blurb: lookAlikeBlurb || undefined,
        // Drawn onto the canvas at export by the compositor (iOS drops raster
        // images from the html-to-image snapshot).
        photos: (style) =>
          lookAlikePhoto ? (
            <div
              data-lookalike-photo
              data-ring={matchRing}
              style={{
                ...style,
                backgroundImage: `url(${lookAlikePhoto})`,
                backgroundSize: "cover",
                // Bias toward the top so the face shows, not the jersey/torso.
                backgroundPosition: "center 22%",
              }}
            />
          ) : null,
      })
    : null;
  const coaches = (stats.coach || stats.assistant_coaches) && (
    <>
      {stats.coach && theme.coach(p, "HEAD COACH", stats.coach)}
      {stats.assistant_coaches && theme.coach(p, "ASSISTANTS", stats.assistant_coaches)}
    </>
  );

  return (
    <div
      ref={ref}
      className="relative w-full mx-auto rounded-2xl overflow-hidden shadow-lg"
      style={{ aspectRatio: landscape ? "7 / 5" : "5 / 7", ...bgStyle }}
    >
      {/* Header — the design's team block. */}
      {theme.header(p)}

      {/* Headshot — small circle, upper-right (above the content panel). The
          compositor reads this element's box so it stays aligned in either
          orientation (landscape uses a smaller circle). */}
      {headshotUrl && (
        <div
          data-headshot
          data-ring={hs.ring}
          onPointerDown={onHeadshotPointerDown}
          onPointerMove={onHeadshotPointerMove}
          onPointerUp={onHeadshotPointerUp}
          onPointerCancel={onHeadshotPointerUp}
          style={{
            position: "absolute",
            top: landscape ? "5%" : "3.5%",
            right: landscape ? "5%" : "9.5%",
            width: landscape ? "17%" : "22%",
            aspectRatio: "1 / 1",
            // background-image (not <img>) so iOS Safari includes it in the snapshot.
            backgroundImage: `url(${headshotUrl})`,
            backgroundSize: "cover",
            backgroundPosition: headshotPosition ?? "center",
            backgroundRepeat: "no-repeat",
            borderRadius: "9999px",
            ...hs.style,
            cursor: onHeadshotPointerDown ? "move" : undefined,
            touchAction: onHeadshotPointerDown ? "none" : undefined,
          }}
        />
      )}

      {/* Content panel (portrait) — bottom ~75%. */}
      {!landscape && (
        <div
          style={{
            position: "absolute",
            left: "5%",
            right: "5%",
            top: "22%",
            bottom: "5%",
            padding: "4%",
            ...theme.panel(p),
            display: "flex",
            flexDirection: "column",
            // Spread the sections to fill the panel instead of leaving a big void
            // above the "plays like" banner; gap is the minimum spacing.
            justifyContent: "space-between",
            gap: "3.5%",
          }}
        >
          {/* Player name row */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "6%",
            }}
          >
            <span
              style={{
                ...theme.name(p),
                fontSize: p.u(7),
                flex: "1 1 auto",
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {playerName || "PLAYER"}
            </span>
            {jersey && theme.jersey(p, jersey)}
          </div>

          {/* Stat row */}
          {statRows.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.min(statRows.length, 5)}, 1fr)`,
                gap: "2%",
              }}
            >
              {statRows.map(([k, v]) => (
                <Fragment key={k}>{theme.stat(p, k, v)}</Fragment>
              ))}
            </div>
          )}

          {/* Season quote — the player's own words, set off like a pull-quote. */}
          {seasonQuote && theme.quote(p, seasonQuote)}

          {/* Scouting report */}
          {scoutingReport && (
            <div>
              {theme.label(p, "SCOUTING REPORT")}
              <p style={theme.body(p)}>{scoutingReport}</p>
            </div>
          )}

          {/* Favorites, signature move + fun answers — a compact two-up grid so
              the (mostly short) answers use the horizontal space. */}
          {hasQA && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.55em 0.9em" }}>{qa}</div>
          )}

          {/* Plays like */}
          {match}

          {/* Coaching staff — a footer under the Player Match. */}
          {coaches && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: stats.coach && stats.assistant_coaches ? "1fr 1fr" : "1fr",
                gap: "0.9em",
                ...theme.divider(p),
              }}
            >
              {coaches}
            </div>
          )}
        </div>
      )}

      {/* Content panel (landscape) — two columns so the wide, short back doesn't
          cram everything into one narrow band. Identity + stats on the left,
          the write-up on the right. */}
      {landscape && (
        <div
          style={{
            position: "absolute",
            left: "4%",
            right: "4%",
            top: "30%",
            bottom: "5%",
            padding: "2.4% 3%",
            ...theme.panel(p),
            display: "flex",
            gap: "3.5%",
            overflow: "hidden",
          }}
        >
          {/* Left column — name, stats, coaching */}
          <div style={{ flex: "0 0 36%", display: "flex", flexDirection: "column", gap: "5%", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "4%" }}>
              <span
                style={{
                  ...theme.name(p),
                  // The name shares a narrow column with the jersey number, so a
                  // long name would clip on one line — let it wrap to two lines
                  // and step the size down as it gets longer.
                  fontSize: p.u(
                    (playerName || "PLAYER").length > 12 ? 4.4 : (playerName || "PLAYER").length > 8 ? 5.3 : 6.5
                  ),
                  flex: "1 1 auto",
                  minWidth: 0,
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: 2,
                  overflow: "hidden",
                  overflowWrap: "anywhere",
                }}
              >
                {playerName || "PLAYER"}
              </span>
              {jersey && theme.jersey(p, jersey)}
            </div>

            {statRows.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5%" }}>
                {statRows.map(([k, v]) => (
                  <Fragment key={k}>{theme.stat(p, k, v)}</Fragment>
                ))}
              </div>
            )}

            {coaches && (
              <div
                style={{
                  marginTop: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5em",
                  ...theme.divider(p),
                }}
              >
                {coaches}
              </div>
            )}
          </div>

          {/* Right column — quote, scouting, favorites, player match */}
          <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", gap: "4%", minWidth: 0, overflow: "hidden" }}>
            {seasonQuote && theme.quote(p, seasonQuote)}

            {scoutingReport && (
              <div>
                {theme.label(p, "SCOUTING REPORT")}
                <p style={theme.body(p)}>{scoutingReport}</p>
              </div>
            )}

            {hasQA && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5em 0.9em" }}>{qa}</div>}

            {match && <div style={{ marginTop: "auto" }}>{match}</div>}
          </div>
        </div>
      )}
    </div>
  );
});

export default CardBack;
