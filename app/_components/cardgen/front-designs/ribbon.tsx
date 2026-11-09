// Ribbon — award-ribbon banners. One shape/type language for every piece:
// Oswald 700 with wide tracking, swallowtail (notched) ribbon ends and sewn
// stitch rules in the secondary color.
//   - team: a primary ribbon with a swallowtail right end, bleeding off the
//     left trim (age · season on a smaller secondary ribbon under it);
//   - jersey: a pennant hanging from the top trim at top-right, piped in the
//     secondary color, with a pointed bottom;
//   - name: a wide banner across the lower card whose tails fold behind it
//     and end in swallowtails (first name small above the big last name);
//   - coaches: a small secondary ribbon tab hanging under the banner.
// Inside a frame the bleeding pieces become inset plates (the team ribbon gets
// a notched left end, the pennant hangs from the keyline). All geometry is in
// card units so every corner's position is known.

import type { CSSProperties, ReactNode } from "react";
import {
  FONTS,
  FONT_EM,
  SAFE,
  abs,
  coachLines,
  fitSize,
  luminance,
  shadow,
  subLine,
  teamOrPlaceholder,
  type FrontDesign,
  type FrontDesignProps,
} from "./shared";

const OSWALD = FONTS.oswald;
const EM = FONT_EM.oswald;

// Letter-spacing (em).
const LS_TEAM = 0.1;
const LS_SUB = 0.26;
const LS_JERSEY = 0.02;
const LS_FIRST = 0.2;
const LS_LAST = 0.04;
const LS_COACH = 0.16;

const DROP = "drop-shadow(0 3px 7px rgba(0,0,0,0.45))";

// ── Color helpers ────────────────────────────────────────────────────────────

export function contrast(a: string, b: string) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// A darker shade of a color (solid gradient layer over it — exports fine).
export function shade(color: string, a: number) {
  return `linear-gradient(rgba(0,0,0,${a}), rgba(0,0,0,${a})), ${color}`;
}

// ── Geometry (card units) ────────────────────────────────────────────────────

function geometry(p: FrontDesignProps) {
  const framed = !!p.frame;
  const inner = p.inset + 1; // framed: closest any plate may come to an edge

  // Jersey pennant: hangs from the top trim (bleeds 3u past it) or, framed,
  // from just inside the keyline. Pointed bottom.
  const penW = 16;
  const penRight = framed ? inner + 0.5 : 6; // gap to the right trim
  const penLeft = p.W - penRight - penW;
  const penTop = framed ? inner : -3;
  const penBottom = framed ? inner + 17 : 20.5; // y of the point
  const penDepth = 5; // height of the pointed part

  // Team ribbon.
  const teamTop = framed ? inner + 0.8 : 6;
  const teamLeft = framed ? inner : -4; // plate's left edge (bleed: past the trim)
  const teamNotchL = framed ? 2 : 0;
  const teamTextLeft = framed ? inner + teamNotchL + 2.4 : 7.5;
  const teamLimit = p.jersey ? penLeft - 3 : framed ? p.W - inner : p.W - SAFE;

  // Name banner: tails' outer tips sit `side` in from each edge.
  const side = framed ? inner : 4;
  const tailVis = p.landscape ? 7.5 : 6; // tail visible beyond the banner face
  const bandL = side + tailVis;
  const bandW = p.W - 2 * bandL;
  const drop = 2.4; // tails sit this much lower than the face
  const fold = 2.4; // width of the fold triangle
  const bottomEdge = framed ? inner + 0.8 : 6.5; // lowest plate's distance to the bottom trim

  return {
    framed,
    penW,
    penRight,
    penLeft,
    penTop,
    penBottom,
    penDepth,
    teamTop,
    teamLeft,
    teamNotchL,
    teamTextLeft,
    teamLimit,
    bandL,
    bandW,
    tailVis,
    drop,
    fold,
    bottomEdge,
  };
}
type Geo = ReturnType<typeof geometry>;

// Team ribbon sizes (u).
const TEAM_PAD_Y = 1.25;
const TEAM_NOTCH = 3;
const TEAM_PAD_R = TEAM_NOTCH + 2.4;
const SUB_PAD_Y = 1.4;
const SUB_NOTCH = 1.8;
const SUB_PAD_R = SUB_NOTCH + 2.4;

// maxHeight (card back only): the block's height limit in u; the team line
// shrinks to fit it. The front leaves it unset.
function teamSizes(p: FrontDesignProps, g: Geo, maxHeight?: number) {
  const team = teamOrPlaceholder(p).toUpperCase();
  const sub = subLine(p).toUpperCase();
  const avail = g.teamLimit - g.teamTextLeft;
  // 0.95: Oswald's caps run a little wider than the average on long names.
  let teamSize = fitSize(team, 7, (avail - TEAM_PAD_R) * 0.95, EM, LS_TEAM);
  const subSize = sub ? fitSize(sub, 2.7, (avail - SUB_PAD_R) * 0.95, EM, LS_SUB) : 0;
  if (maxHeight !== undefined) {
    const rest = 2 * TEAM_PAD_Y + (sub ? 0.6 + subSize * 1.1 + 2 * SUB_PAD_Y : 0);
    teamSize = Math.max(0.5, Math.min(teamSize, Math.floor(((maxHeight - rest) / 1.1) * 100) / 100));
  }
  const height =
    teamSize * 1.1 + 2 * TEAM_PAD_Y + (sub ? 0.6 + subSize * 1.1 + 2 * SUB_PAD_Y : 0);
  // Estimated right end of the widest ribbon (for the limited-edition stamp).
  const right = Math.max(
    g.teamTextLeft + [...team].length * (EM + LS_TEAM) * teamSize + TEAM_PAD_R,
    sub ? g.teamTextLeft + [...sub].length * (EM + LS_SUB) * subSize + SUB_PAD_R : 0
  );
  return { team, sub, teamSize, subSize, height, right };
}

// ── Pieces ───────────────────────────────────────────────────────────────────

// A sewn stitch: a dashed rule drawn with a repeating gradient.
export function Stitch({
  p,
  color,
  y,
  at,
  left,
  right,
  thick = 0.36,
}: {
  p: FrontDesignProps;
  color: string;
  y: number;
  at: "top" | "bottom";
  left: number;
  right: number;
  thick?: number;
}) {
  const dash = 1.25;
  const gap = 0.75;
  return (
    <div
      style={{
        position: "absolute",
        left: p.u(left),
        right: p.u(right),
        [at]: p.u(y),
        height: p.u(thick),
        background: `repeating-linear-gradient(90deg, ${color} 0 ${p.u(dash)}, transparent ${p.u(dash)} ${p.u(dash + gap)})`,
      }}
    />
  );
}

// A horizontal ribbon: flat or swallowtail-notched ends, stitched along the
// top and bottom.
export function Ribbon({
  p,
  bg,
  stitch,
  notchL = 0,
  notchR = 0,
  padL,
  padR,
  padY,
  stitchInset = 0.7,
  stitchThick,
  style,
  children,
}: {
  p: FrontDesignProps;
  bg: string;
  stitch: string | null;
  notchL?: number;
  notchR?: number;
  padL: number;
  padR: number;
  padY: number;
  stitchInset?: number;
  stitchThick?: number;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const pts = ["0 0", "100% 0"];
  if (notchR) pts.push(`calc(100% - ${p.u(notchR)}) 50%`);
  pts.push("100% 100%", "0 100%");
  if (notchL) pts.push(`${p.u(notchL)} 50%`);
  const sl = notchL ? notchL + 0.9 : 0;
  const sr = notchR ? notchR + 0.9 : 0;
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        background: bg,
        clipPath: `polygon(${pts.join(", ")})`,
        padding: `${p.u(padY)} ${p.u(padR)} ${p.u(padY)} ${p.u(padL)}`,
        ...style,
      }}
    >
      {stitch && (
        <>
          <Stitch p={p} color={stitch} at="top" y={stitchInset} left={sl} right={sr} thick={stitchThick} />
          <Stitch p={p} color={stitch} at="bottom" y={stitchInset} left={sl} right={sr} thick={stitchThick} />
        </>
      )}
      {children}
    </div>
  );
}

function text(size: string, ls: number, extra?: CSSProperties): CSSProperties {
  return {
    position: "relative",
    fontFamily: OSWALD,
    fontWeight: 700,
    fontSize: size,
    letterSpacing: `${ls}em`,
    lineHeight: 1.1,
    whiteSpace: "nowrap",
    ...extra,
  };
}

function Team({ p, g, maxHeight }: { p: FrontDesignProps; g: Geo; maxHeight?: number }) {
  const s = teamSizes(p, g, maxHeight);
  const pal = p.palette;
  return (
    <div
      style={abs({
        top: p.u(g.teamTop),
        left: p.u(g.teamLeft),
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: p.u(0.6),
        ...shadow(p, DROP),
      })}
    >
      <Ribbon
        p={p}
        bg={pal.background}
        stitch={pal.subBackground}
        notchL={g.teamNotchL}
        notchR={TEAM_NOTCH}
        padL={g.teamTextLeft - g.teamLeft}
        padR={TEAM_PAD_R}
        padY={TEAM_PAD_Y}
      >
        <div style={text(p.u(s.teamSize), LS_TEAM, { color: pal.color })}>{s.team}</div>
      </Ribbon>
      {s.sub && (
        <Ribbon
          p={p}
          bg={pal.subBackground}
          stitch={p.compact ? null : pal.background}
          stitchInset={0.5}
          stitchThick={0.26}
          notchL={g.framed ? SUB_NOTCH : 0}
          notchR={SUB_NOTCH}
          padL={g.teamTextLeft - g.teamLeft}
          padR={SUB_PAD_R}
          padY={SUB_PAD_Y}
        >
          <div style={text(p.u(s.subSize), LS_SUB, { color: pal.subColor })}>{s.sub}</div>
        </Ribbon>
      )}
    </div>
  );
}

// The front's team block alone (no jersey pennant), for the card back: the
// widest ribbon ends by x = `limit` and the block ends above y = `bottom` (u).
export function RibbonTeamBlock({ p, limit, bottom }: { p: FrontDesignProps; limit: number; bottom: number }) {
  const g = { ...geometry({ ...p, jersey: "" }), teamLimit: limit };
  return <Team p={p} g={g} maxHeight={bottom - g.teamTop} />;
}

// Pennant outline inset by b (u) in a w × h box: straight sides, pointed
// bottom of the given depth. Returned as a clip-path in % of the box.
export function pennantClip(w: number, h: number, depth: number, b: number, insetTop: boolean) {
  const half = w / 2;
  const slant = Math.hypot(half, depth) / half;
  const tipY = h - b * slant;
  const shoulderY = tipY - ((half - b) * depth) / half;
  const top = insetTop ? b : 0;
  const pct = (v: number, t: number) => `${+((v / t) * 100).toFixed(3)}%`;
  const pts: Array<[number, number]> = [
    [b, top],
    [w - b, top],
    [w - b, shoulderY],
    [half, tipY],
    [b, shoulderY],
  ];
  return `polygon(${pts.map(([x, y]) => `${pct(x, w)} ${pct(y, h)}`).join(", ")})`;
}

function Jersey({ p, g }: { p: FrontDesignProps; g: Geo }) {
  if (!p.jersey) return null;
  const pal = p.palette;
  const w = g.penW;
  const h = g.penBottom - g.penTop;
  const layers: Array<[number, string]> = [
    [0, pal.subBackground],
    [0.7, pal.background],
    [1.3, pal.subBackground],
    [1.62, pal.background],
  ];
  // Number box: from just under the visible top to a little past the shoulder.
  const numTop = g.framed ? g.penTop + 1.8 : 5;
  const numBottom = g.penBottom - g.penDepth + 0.6;
  // Oswald digits are ~0.55em wide; the "#" is drawn at 0.45×. Keep 1.2u
  // clear of the inner piping on each side.
  const n = [...p.jersey].length;
  const size = Math.min(9.6, (w - 2 * 1.62 - 2.4) / ((n + 0.45) * 0.56));
  return (
    <div
      style={abs({
        left: p.u(g.penLeft),
        top: p.u(g.penTop),
        width: p.u(w),
        height: p.u(h),
        ...shadow(p, DROP),
      })}
    >
      {layers.map(([b, bg]) => (
        <div
          key={b}
          style={{
            position: "absolute",
            inset: 0,
            background: bg,
            clipPath: pennantClip(w, h, g.penDepth, b, g.framed),
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: p.u(numTop - g.penTop),
          height: p.u(numBottom - numTop),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: pal.color,
          fontFamily: OSWALD,
          fontWeight: 700,
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: p.u(size * 0.45), letterSpacing: `${LS_JERSEY}em` }}>#</span>
        <span style={{ fontSize: p.u(size), letterSpacing: `${LS_JERSEY}em` }}>{p.jersey}</span>
      </div>
    </div>
  );
}

const STAR = 0.62;
const STAR_GAP = 0.32;
const STAR_CLIP =
  "polygon(50% 0%, 61.2% 34.5%, 97.6% 34.5%, 68.2% 55.9%, 79.4% 90.5%, 50% 69.1%, 20.6% 90.5%, 31.8% 55.9%, 2.4% 34.5%, 38.8% 34.5%)";

export function Star({ size, color }: { size: string; color: string }) {
  return <div style={{ width: size, height: size, flex: "none", background: color, clipPath: STAR_CLIP }} />;
}

function Name({ p, g }: { p: FrontDesignProps; g: Geo }) {
  const pal = p.palette;
  const primary = pal.background;
  const ink = pal.color;
  const accent = contrast(pal.subBackground, primary) >= 3 ? pal.subBackground : ink;
  const padX = 3.5;
  const em = p.nameFont.em;

  let small = "";
  let big = "";
  if (p.isGroup) {
    big = (p.nameLines[0] ?? "").toUpperCase();
  } else {
    const [l1 = "", l2 = ""] = p.nameLines;
    if (l1 && l2) {
      small = l1;
      big = l2;
    } else {
      big = l1 || l2;
    }
  }
  const bigBase = (p.isGroup ? 9 : p.landscape ? 9.5 : 11) * p.nameSize;
  const smallBase = (p.landscape ? 4.4 : 5) * p.nameSize;

  const { head, assistants } = coachLines(p.coaches);
  const coachOne = head && assistants ? `${head}  ·  ${assistants}` : head || assistants || "";
  const coachNotch = 1.8;
  const coachPadX = coachNotch + 2;

  // Banner width: the full width between the tails on a portrait card; on a
  // landscape card it hugs the name (and coach line) so it reads as a ribbon,
  // not a bar.
  let bandW = g.bandW;
  if (p.landscape) {
    const width = (t: string, size: number, ls: number, e: number) => [...t].length * (e + ls) * size;
    const nameNeed = Math.max(width(big, bigBase, LS_LAST, em), small ? width(small, smallBase, LS_FIRST, em) : 0);
    const coachNeed = coachOne ? width(coachOne, 2.4, LS_COACH, EM) + 2 * coachPadX + 8 : 0;
    bandW = Math.min(g.bandW, Math.max(0.62 * p.W, nameNeed + 2 * padX + 14, coachNeed));
  }
  const bandL = (p.W - bandW) / 2;
  // 0.9: names with many wide capitals (M, W, O…) run past the font's
  // average advance; italics lean a little further.
  const nameAvail = (bandW - 2 * padX) * (p.nameItalic ? 0.86 : 0.9);
  const bigSize = fitSize(big, bigBase, nameAvail, em, LS_LAST);
  // First name is flanked by two small stars (each STAR em + STAR_GAP em).
  const smallSize = small
    ? Math.max(0.5, Math.min(smallBase, nameAvail / ([...small].length * (em + LS_FIRST) + 2 * (STAR + STAR_GAP))))
    : 0;

  // Coaches: one line when it fits comfortably, else head / assistants.
  const coachAvail = (bandW - (p.landscape ? 4 : 8) - 2 * coachPadX) * 0.95;
  let coachRows: Array<{ text: string; size: number; ls: number }> = [];
  if (head && assistants) {
    const oneSize = fitSize(coachOne, 2.5, coachAvail, EM, LS_COACH);
    coachRows =
      oneSize >= (p.landscape ? 2.15 : 2.3)
        ? [{ text: coachOne, size: oneSize, ls: LS_COACH }]
        : [
            { text: head, size: fitSize(head, 2.6, coachAvail, EM, LS_COACH), ls: LS_COACH },
            { text: assistants, size: fitSize(assistants, 2.3, coachAvail, EM, LS_COACH * 0.75), ls: LS_COACH * 0.75 },
          ];
  } else if (coachOne) {
    coachRows = [{ text: coachOne, size: fitSize(coachOne, 2.6, coachAvail, EM, LS_COACH), ls: LS_COACH }];
  }
  const hasCoach = coachRows.length > 0;
  const hasName = !!(big || small);
  if (!hasName && !hasCoach) return null;

  // Tails in the secondary color when it shows against the card (light text
  // scheme = dark card); otherwise a darker fold of the banner itself.
  const cardRef = luminance(p.textColor) > 0.5 ? "#161616" : "#eef2f6";
  const secTails = contrast(pal.subBackground, cardRef) >= 2.2;
  const tailBg = secTails ? pal.subBackground : shade(primary, 0.3);
  const foldBg = secTails ? shade(pal.subBackground, 0.45) : shade(primary, 0.55);
  const stitchColor = pal.subBackground;
  const tailStitch = secTails ? primary : pal.subBackground;
  const tailClipL = `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${p.u(2.4)} 50%)`;
  const tailClipR = `polygon(0 0, 100% 0, calc(100% - ${p.u(2.4)}) 50%, 100% 100%, 0 100%)`;
  const tail = (sideKey: "left" | "right"): CSSProperties => ({
    position: "absolute",
    [sideKey]: p.u(-g.tailVis),
    width: p.u(g.tailVis + g.fold),
    top: p.u(g.drop),
    bottom: p.u(-g.drop),
    background: tailBg,
    clipPath: sideKey === "left" ? tailClipL : tailClipR,
  });
  const nameText = (size: number, ls: number, color: string): CSSProperties => ({
    position: "relative",
    fontFamily: p.nameFont.family,
    fontStyle: p.nameItalic ? "italic" : "normal",
    fontSize: p.u(size),
    letterSpacing: `${ls}em`,
    paddingLeft: `${ls}em`, // balance the trailing letter-space so it centers
    lineHeight: 1.04,
    whiteSpace: "nowrap",
    color,
  });

  return (
    <div
      style={abs({
        left: p.u(bandL),
        width: p.u(bandW),
        bottom: p.u(g.bottomEdge + (hasCoach || !hasName ? 0 : g.drop)),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        ...shadow(p, DROP),
      })}
    >
      {hasName && (
        <div style={{ position: "relative", alignSelf: "stretch" }}>
          <div style={tail("left")}>
            <Stitch p={p} color={tailStitch} at="top" y={0.7} left={3.3} right={0} />
            <Stitch p={p} color={tailStitch} at="bottom" y={0.7} left={3.3} right={0} />
          </div>
          <div style={tail("right")}>
            <Stitch p={p} color={tailStitch} at="top" y={0.7} left={0} right={3.3} />
            <Stitch p={p} color={tailStitch} at="bottom" y={0.7} left={0} right={3.3} />
          </div>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: "100%",
              width: p.u(g.fold),
              height: p.u(g.drop),
              background: foldBg,
              clipPath: "polygon(0 0, 100% 0, 100% 100%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "100%",
              width: p.u(g.fold),
              height: p.u(g.drop),
              background: foldBg,
              clipPath: "polygon(0 0, 100% 0, 0 100%)",
            }}
          />
          <div
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              background: primary,
              padding: `${p.u(1.6)} ${p.u(padX)} ${p.u(1.4)}`,
            }}
          >
            <Stitch p={p} color={stitchColor} at="top" y={0.7} left={0} right={0} />
            <Stitch p={p} color={stitchColor} at="bottom" y={0.7} left={0} right={0} />
            {small && (
              <div style={{ display: "flex", alignItems: "center", gap: p.u(smallSize * STAR_GAP), fontSize: p.u(smallSize) }}>
                <Star size={p.u(smallSize * STAR)} color={accent} />
                <div style={nameText(smallSize, LS_FIRST, accent)}>{small}</div>
                <Star size={p.u(smallSize * STAR)} color={accent} />
              </div>
            )}
            <div style={nameText(bigSize, LS_LAST, ink)}>{big}</div>
          </div>
        </div>
      )}
      {hasCoach && (
        <Ribbon
          p={p}
          bg={pal.subBackground}
          stitch={p.compact ? null : primary}
          stitchInset={0.5}
          stitchThick={0.26}
          notchL={coachNotch}
          notchR={coachNotch}
          padL={coachPadX}
          padR={coachPadX}
          padY={1.3}
        >
          {coachRows.map((r) => (
            <div
              key={r.text}
              style={text(p.u(r.size), r.ls, { color: pal.subColor, paddingLeft: `${r.ls}em`, lineHeight: 1.2 })}
            >
              {r.text}
            </div>
          ))}
        </Ribbon>
      )}
    </div>
  );
}

export const ribbon: FrontDesign = {
  id: "ribbon",
  name: "Ribbon",
  nameFont: "oswald",
  render: (p) => {
    const g = geometry(p);
    return (
      <>
        <Team p={p} g={g} />
        <Jersey p={p} g={g} />
        <Name p={p} g={g} />
      </>
    );
  },
  // The stamp sits right-aligned under the pennant (or under the team ribbon
  // when that runs into the top-right corner).
  circulation: (p) => {
    const g = geometry(p);
    const s = teamSizes(p, g);
    const teamBottom = g.teamTop + s.height;
    const right = p.u(g.framed ? g.penRight : 6);
    if (p.jersey) return { top: p.u(Math.max(g.penBottom, teamBottom) + 2.5), right };
    const stampLeft = p.W - 6 - 27;
    if (s.right + 3 <= stampLeft) return { top: p.u(g.framed ? p.inset + 2 : 6.5), right };
    return { top: p.u(teamBottom + 2.5), right };
  },
};
