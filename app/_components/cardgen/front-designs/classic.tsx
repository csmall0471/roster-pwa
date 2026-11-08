// Classic — the original card front: white/black chevron chips top-left, a dark
// round jersey badge top-right and the player name as plain title text at the
// bottom (or on the frame's colored plate). With no colors picked and coaches
// off it must render exactly like cards made before front designs existed.

import { FRAME_PLATE_INSET_PCT } from "../frames";
import {
  FONTS,
  FONT_EM,
  abs,
  coachText,
  fitSize,
  shadow,
  subLine,
  teamOrPlaceholder,
  type FrontDesign,
  type FrontDesignProps,
} from "./shared";

function Jersey(p: FrontDesignProps) {
  if (!p.jersey) return null;
  const user = p.colorSource === "user";
  return (
    <div
      style={abs({
        top: "6%",
        right: "7%",
        minWidth: "14%",
        aspectRatio: "1 / 1",
        borderRadius: "9999px",
        background: user ? p.palette.subBackground : "rgba(10,10,10,0.85)",
        color: user ? p.palette.subColor : "#fff",
        ...(user ? { border: `${p.u(0.7)} solid ${p.palette.background}`, boxSizing: "border-box" as const } : {}),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONTS.anton,
        fontSize: p.u(7),
        letterSpacing: "0.02em",
        // drop-shadow (not box-shadow): box-shadow on a round element
        // rasterizes to a rectangular shadow through html-to-image.
        ...shadow(p, "drop-shadow(0 4px 10px rgba(0,0,0,0.4))"),
      })}
    >
      #{p.jersey}
    </div>
  );
}

function Team(p: FrontDesignProps) {
  const framed = !!p.frame;
  const sub = subLine(p);
  return (
    <div
      style={abs({
        top: framed ? p.u(FRAME_PLATE_INSET_PCT + 1.2) : "6.5%",
        left: framed ? p.u(FRAME_PLATE_INSET_PCT) : 0,
        ...shadow(p),
      })}
    >
      <div
        style={{
          background: p.palette.background,
          color: p.palette.color,
          padding: framed ? "0.38em 1.4em" : `0.38em 1.6em 0.38em ${p.u(9)}`,
          clipPath: "polygon(0 0, 100% 0, calc(100% - 0.8em) 100%, 0 100%)",
          fontFamily: FONTS.anton,
          fontSize: p.u(7),
          letterSpacing: "0.04em",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        {teamOrPlaceholder(p)}
      </div>
      {sub && (
        <div
          style={{
            background: p.palette.subBackground,
            color: p.palette.subColor,
            padding: framed ? "0.45em 1.4em" : `0.45em 1.6em 0.45em ${p.u(9)}`,
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

function Name(p: FrontDesignProps) {
  // The frame's name plate; with picked team colors it takes the primary.
  const framePlate = p.frame?.namePlate ?? null;
  const plate =
    framePlate && p.colorSource === "user"
      ? { background: p.palette.background, color: p.palette.color }
      : framePlate;
  const coaches = coachText(p.coaches);
  // Name block width in u (left/right 8% of the card, or the frame inset).
  const blockW = plate ? p.W - 2 * FRAME_PLATE_INSET_PCT - 4.8 : p.W * 0.84;
  return (
    <div
      style={abs({
        left: plate ? p.u(FRAME_PLATE_INSET_PCT) : "8%",
        right: plate ? p.u(FRAME_PLATE_INSET_PCT) : "8%",
        bottom: plate ? p.u(FRAME_PLATE_INSET_PCT + 0.8) : "7%",
        fontFamily: p.nameFont.family,
        fontStyle: p.nameItalic ? "italic" : "normal",
        color: plate ? plate.color : p.textColor,
        textShadow: plate ? "none" : p.textShadow,
        lineHeight: 0.92,
        letterSpacing: "0.01em",
        ...(plate
          ? {
              background: plate.background,
              padding: `${p.u(1.6)} ${p.u(2.4)}`,
              borderRadius: p.u(1),
              textAlign: "center" as const,
              ...shadow(p, "drop-shadow(0 3px 8px rgba(0,0,0,0.4))"),
            }
          : {}),
      })}
    >
      {p.isGroup ? (
        // Shared name plate — all players on one line ("CJ & ALEX"), uppercased.
        <div style={{ fontSize: p.u(8 * p.nameSize), textTransform: "uppercase" }}>{p.nameLines[0]}</div>
      ) : (
        <>
          <div style={{ fontSize: p.u(11 * p.nameSize) }}>{p.nameLines[0]}</div>
          <div style={{ fontSize: p.u(11 * p.nameSize), marginTop: "2%" }}>{p.nameLines[1]}</div>
        </>
      )}
      {coaches && (
        <div
          style={{
            marginTop: p.u(2),
            fontFamily: FONTS.sans,
            fontStyle: "normal",
            fontWeight: 700,
            fontSize: p.u(fitSize(coaches, 2.3, blockW, FONT_EM.sans, 0.16)),
            letterSpacing: "0.16em",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
          }}
        >
          {coaches}
        </div>
      )}
    </div>
  );
}

export const classic: FrontDesign = {
  id: "chevron",
  name: "Classic",
  nameFont: "anton",
  render: (p) => (
    <>
      <Jersey {...p} />
      <Team {...p} />
      <Name {...p} />
    </>
  ),
};
