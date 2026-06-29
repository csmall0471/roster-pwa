import { forwardRef, type CSSProperties } from "react";

export type BackStats = {
  position: string;
  height: string;
  jersey: string;
  hand: string;
  favorite_team: string;
  favorite_player: string;
  signature_move: string;
  age: string;
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
  lookAlike: string;
  lookAlikePhoto?: string | null; // photo of the matched pro player
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
    lookAlike,
    lookAlikePhoto,
    headshotUrl,
    headshotPosition,
    onHeadshotPointerDown,
    onHeadshotPointerMove,
    onHeadshotPointerUp,
  },
  ref
) {
  const statRows: Array<[string, string]> = [
    ["POS", stats.position],
    ["HT", stats.height],
    ["#", jersey || stats.jersey],
    ["HAND", stats.hand],
    ["AGE", stats.age],
  ].filter(([, v]) => v && v.length > 0) as Array<[string, string]>;

  return (
    <div
      ref={ref}
      className="relative w-full mx-auto rounded-2xl overflow-hidden shadow-lg"
      style={{ aspectRatio: "5 / 7", ...bgStyle }}
    >
      {/* Header chevron chips — matches the front. */}
      <div
        style={{
          position: "absolute",
          top: "5%",
          left: 0,
          pointerEvents: "none",
          filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.45))",
        }}
      >
        <div
          style={{
            background: "#fff",
            color: "#0a0a0a",
            padding: "0.38em 1.6em 0.38em 5%",
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
              padding: "0.45em 1.6em 0.45em 5%",
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
            top: "4.5%",
            right: "5%",
            width: "22%",
            aspectRatio: "1 / 1",
            // background-image (not <img>) so iOS Safari includes it in the snapshot.
            backgroundImage: `url(${headshotUrl})`,
            backgroundSize: "cover",
            backgroundPosition: headshotPosition ?? "center",
            backgroundRepeat: "no-repeat",
            borderRadius: "9999px",
            border: "3px solid rgba(255,255,255,0.92)",
            boxShadow: "0 4px 10px rgba(0,0,0,0.45)",
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
          gap: "3%",
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
                    fontSize: "min(4.2vw, 22px)",
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

        {/* Favorites + signature move list */}
        {(stats.favorite_team || stats.favorite_player || stats.signature_move) && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.35em",
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
          </div>
        )}

        {/* Plays like */}
        {lookAlike && (
          <div
            style={{
              marginTop: "auto",
              background: "linear-gradient(90deg, rgba(251,191,36,0.95) 0%, rgba(251,146,60,0.95) 100%)",
              color: "#0a0a0a",
              borderRadius: "10px",
              padding: "0.7em 0.9em",
              display: "flex",
              alignItems: "center",
              gap: "0.7em",
            }}
          >
            {lookAlikePhoto && (
              // Drawn onto the canvas at export by the compositor (iOS drops
              // raster images from the html-to-image snapshot).
              <div
                data-lookalike-photo
                style={{
                  width: "13%",
                  aspectRatio: "1 / 1",
                  flexShrink: 0,
                  borderRadius: "9999px",
                  backgroundImage: `url(${lookAlikePhoto})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  border: "2px solid rgba(10,10,10,0.55)",
                }}
              />
            )}
            <span
              style={{
                fontSize: "min(2vw, 10px)",
                letterSpacing: "0.22em",
                fontWeight: 800,
                whiteSpace: "nowrap",
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
        )}
      </div>
    </div>
  );
});

function FavRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: "0.6em",
        fontSize: "min(2.8vw, 13px)",
      }}
    >
      <span
        style={{
          fontSize: "min(2vw, 10px)",
          letterSpacing: "0.2em",
          color: "rgba(255,255,255,0.55)",
          fontWeight: 700,
          minWidth: "5.5em",
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
