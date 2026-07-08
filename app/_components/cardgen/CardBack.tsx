import { forwardRef, type CSSProperties } from "react";

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
  picks_me_up: string;
};

type Props = {
  bgStyle: CSSProperties;
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

// Used in CardEditor as the back-side stage. Pure presentational — owns
// no state. Same 5/7 aspect + same chevron name-plate language as the front.

const CardBack = forwardRef<HTMLDivElement, Props>(function CardBack(
  {
    bgStyle,
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
  const statRows: Array<[string, string]> = [
    ["POS", abbreviatePosition(stats.position)],
    ["HT", stats.height],
    ["#", jersey || stats.jersey],
    ["AGE", stats.age],
  ].filter(([, v]) => v && v.length > 0) as Array<[string, string]>;

  return (
    <div
      ref={ref}
      className="relative w-full mx-auto rounded-2xl overflow-hidden shadow-lg"
      style={{ aspectRatio: "5 / 7", ...bgStyle }}
    >
      {/* Header chevron chips — matches the front. Flush-left plate with the
          text inset so print trim can't clip it. */}
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
            padding: "0.38em 1.6em 0.38em 8%",
            clipPath: "polygon(0 0, 100% 0, calc(100% - 0.8em) 100%, 0 100%)",
            fontFamily: "var(--font-anton), Impact, sans-serif",
            fontSize: "min(7vw, 38px)",
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
              padding: "0.45em 1.6em 0.45em 8%",
              clipPath: "polygon(0 0, 100% 0, calc(100% - 0.7em) 100%, 0 100%)",
              fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
              fontSize: "min(2.7vw, 14px)",
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

      {/* Headshot — small circle, upper-right (above the content panel). */}
      {headshotUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <div
          onPointerDown={onHeadshotPointerDown}
          onPointerMove={onHeadshotPointerMove}
          onPointerUp={onHeadshotPointerUp}
          onPointerCancel={onHeadshotPointerUp}
          style={{
            position: "absolute",
            top: "6%",
            right: "7%",
            width: "22%",
            aspectRatio: "1 / 1",
            // background-image (not <img>) so iOS Safari includes it in the snapshot.
            backgroundImage: `url(${headshotUrl})`,
            backgroundSize: "cover",
            backgroundPosition: headshotPosition ?? "center",
            backgroundRepeat: "no-repeat",
            borderRadius: "9999px",
            border: "3px solid rgba(255,255,255,0.92)",
            // drop-shadow (not box-shadow): box-shadow on a round element
            // rasterizes to a rectangular shadow through html-to-image.
            filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.45))",
            cursor: onHeadshotPointerDown ? "move" : undefined,
            touchAction: onHeadshotPointerDown ? "none" : undefined,
          }}
        />
      )}

      {/* Content panel — semi-transparent dark sheet anchored to the bottom 75%. */}
      <div
        style={{
          position: "absolute",
          left: "5%",
          right: "5%",
          top: "22%",
          bottom: "5%",
          background: "rgba(0,0,0,0.62)",
          borderRadius: "14px",
          padding: "4%",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          // Spread the sections to fill the panel instead of leaving a big void
          // above the "plays like" banner; gap is the minimum spacing.
          justifyContent: "space-between",
          gap: "3.5%",
          fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
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
              fontFamily: "var(--font-anton), Impact, sans-serif",
              fontSize: "min(7vw, 36px)",
              letterSpacing: "0.04em",
              lineHeight: 1,
              flex: "1 1 auto",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {playerName || "PLAYER"}
          </span>
          {jersey && (
            <span
              style={{
                fontFamily: "var(--font-anton), Impact, sans-serif",
                fontSize: "min(8vw, 44px)",
                color: "#fbbf24",
                lineHeight: 1,
              }}
            >
              #{jersey}
            </span>
          )}
        </div>

        {/* Stat row — pill chips */}
        {statRows.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.min(statRows.length, 5)}, 1fr)`,
              gap: "2%",
            }}
          >
            {statRows.map(([k, v]) => (
              <div
                key={k}
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
                    fontSize: "min(1.9vw, 10px)",
                    letterSpacing: "0.18em",
                    color: "rgba(255,255,255,0.55)",
                    fontWeight: 700,
                  }}
                >
                  {k}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-anton), Impact, sans-serif",
                    // Shrink so longer values (e.g. an un-abbreviated position or
                    // a tall height like 5'11") stay on one line inside the pill.
                    fontSize: v.length > 4 ? "min(3vw, 15px)" : "min(4.2vw, 22px)",
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
            ))}
          </div>
        )}

        {/* Season quote — the player's own words, set off like a pull-quote. */}
        {seasonQuote && (
          <div
            style={{
              borderLeft: "3px solid #fbbf24",
              paddingLeft: "0.7em",
            }}
          >
            <p
              style={{
                fontSize: "min(3.1vw, 15px)",
                lineHeight: 1.35,
                fontStyle: "italic",
                fontWeight: 600,
                color: "#fff",
                margin: 0,
              }}
            >
              &ldquo;{seasonQuote}&rdquo;
            </p>
          </div>
        )}

        {/* Scouting report */}
        {scoutingReport && (
          <div>
            <div
              style={{
                fontSize: "min(2vw, 10px)",
                letterSpacing: "0.22em",
                color: "rgba(255,255,255,0.55)",
                fontWeight: 700,
                marginBottom: "0.4em",
              }}
            >
              SCOUTING REPORT
            </div>
            <p
              style={{
                fontSize: "min(2.9vw, 14px)",
                lineHeight: 1.4,
                fontStyle: "italic",
                color: "rgba(255,255,255,0.92)",
                margin: 0,
              }}
            >
              {scoutingReport}
            </p>
          </div>
        )}

        {/* Favorites, signature move + fun "questionnaire" answers */}
        {(stats.favorite_team ||
          stats.favorite_player ||
          stats.signature_move ||
          stats.favorite_drill ||
          stats.biggest_fan ||
          stats.loudest_parent ||
          stats.picks_me_up) && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.55em",
            }}
          >
            {stats.favorite_team && (
              <FavRow label="FAV TEAM" value={stats.favorite_team} />
            )}
            {stats.favorite_player && (
              <FavRow label="FAV PLAYER" value={stats.favorite_player} />
            )}
            {stats.signature_move && (
              <FavRow label="SIG MOVE" value={stats.signature_move} />
            )}
            {stats.favorite_drill && (
              <FavRow label="FAV DRILL" value={stats.favorite_drill} />
            )}
            {stats.biggest_fan && (
              <FavRow label="BIGGEST FAN" value={stats.biggest_fan} />
            )}
            {stats.loudest_parent && (
              <FavRow label="LOUDEST FAN" value={stats.loudest_parent} />
            )}
            {stats.picks_me_up && (
              <FavRow label="PICKS ME UP" value={stats.picks_me_up} />
            )}
          </div>
        )}

        {/* Plays like */}
        {lookAlike && (
          <div
            style={{
              background: "linear-gradient(90deg, rgba(251,191,36,0.95) 0%, rgba(251,146,60,0.95) 100%)",
              color: "#0a0a0a",
              borderRadius: "10px",
              padding: "0.7em 0.9em",
              display: "flex",
              alignItems: "center",
              gap: "0.8em",
            }}
          >
            {lookAlikePhoto && (
              // Drawn onto the canvas at export by the compositor (iOS drops
              // raster images from the html-to-image snapshot).
              <div
                data-lookalike-photo
                style={{
                  width: "16%",
                  aspectRatio: "1 / 1",
                  flexShrink: 0,
                  borderRadius: "9999px",
                  backgroundImage: `url(${lookAlikePhoto})`,
                  backgroundSize: "cover",
                  // Bias toward the top so the face shows, not the jersey/torso.
                  backgroundPosition: "center 22%",
                  border: "2px solid rgba(10,10,10,0.55)",
                }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "0.55em",
                }}
              >
                <span
                  style={{
                    fontSize: "min(2vw, 10px)",
                    letterSpacing: "0.22em",
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  PLAYS LIKE
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-anton), Impact, sans-serif",
                    fontSize: "min(5.5vw, 28px)",
                    lineHeight: 1,
                    letterSpacing: "0.03em",
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {lookAlike.toUpperCase()}
                </span>
              </div>
              {lookAlikeBlurb && (
                <p
                  style={{
                    margin: "0.3em 0 0",
                    fontSize: "min(2.5vw, 12px)",
                    lineHeight: 1.25,
                    fontWeight: 600,
                    fontStyle: "italic",
                    color: "rgba(10,10,10,0.82)",
                  }}
                >
                  {lookAlikeBlurb}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

// Shorten common positions to a badge code so they fit the stat pill; custom
// values (e.g. "Wing") pass through and the pill shrinks the font to fit.
function abbreviatePosition(pos: string): string {
  const key = pos.trim().toLowerCase().replace(/\s+/g, " ");
  const map: Record<string, string> = {
    "point guard": "PG",
    "shooting guard": "SG",
    "small forward": "SF",
    "power forward": "PF",
    center: "C",
    guard: "G",
    forward: "F",
    "guard/forward": "G/F",
    "forward/center": "F/C",
    "combo guard": "CG",
    wing: "W",
    utility: "UTIL",
  };
  return map[key] ?? pos;
}

function FavRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: "0.6em",
        fontSize: "min(3.1vw, 15px)",
      }}
    >
      <span
        style={{
          fontSize: "min(2.1vw, 10.5px)",
          letterSpacing: "0.16em",
          color: "rgba(255,255,255,0.55)",
          fontWeight: 700,
          minWidth: "6.5em",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: "#fff",
          fontWeight: 600,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
        }}
      >
        {value}
      </span>
    </div>
  );
}

export default CardBack;
