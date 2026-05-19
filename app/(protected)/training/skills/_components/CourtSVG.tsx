// Shared half-court SVG — basket at top, half-court line at bottom.
// ViewBox: 0 0 390 580
// Basket rim center: (195, 27)
// Free throw line: y = 200
// 3-point arc bottom: (195, 295) — corners at (30, 220) and (360, 220)
// Half-court line: y = 570

export const COURT_VIEWBOX = "0 0 390 580"

// Key geometry constants used by child scorers
export const COURT = {
  basketCx:  195,
  basketCy:   27,
  ftLineY:   200,
  threePtY:  295, // bottom of arc
  halfCourtY: 565,
  width: 390,
  height: 580,
} as const

type Props = {
  className?: string
  children?:  React.ReactNode
  style?:     React.CSSProperties
}

export default function CourtSVG({ className, children, style }: Props) {
  return (
    <svg
      viewBox={COURT_VIEWBOX}
      className={className}
      style={{ maxHeight: "100%", maxWidth: "100%", ...style }}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Wood-tone court surface */}
      <rect x="0" y="0" width="390" height="580" fill="#c8a06a" />

      {/* Court border */}
      <rect x="5" y="5" width="380" height="570" fill="none" stroke="white" strokeWidth="3" />

      {/* Key / paint */}
      <rect x="140" y="5" width="110" height="195" fill="rgba(160,95,25,0.35)" stroke="white" strokeWidth="2" />

      {/* Free throw line */}
      <line x1="140" y1="200" x2="250" y2="200" stroke="white" strokeWidth="2.5" />

      {/* Free throw circle — full (both halves visible) */}
      <circle cx="195" cy="200" r="55" fill="none" stroke="white" strokeWidth="2" />

      {/* 3-point line — corner straights + arc */}
      {/* Corners: x=30 and x=360, from baseline (y=5) to y=220 */}
      <line x1="30" y1="5" x2="30" y2="220" stroke="white" strokeWidth="2" />
      <line x1="360" y1="5" x2="360" y2="220" stroke="white" strokeWidth="2" />
      {/* Arc: radius 219, center at (195, 76), bottom at (195, 295) */}
      <path d="M 30 220 A 219 219 0 0 1 360 220" fill="none" stroke="white" strokeWidth="2" />

      {/* Half-court line */}
      <line x1="5" y1="565" x2="385" y2="565" stroke="white" strokeWidth="2" />

      {/* Center circle (half-court) */}
      <circle cx="195" cy="565" r="35" fill="none" stroke="white" strokeWidth="2" />

      {/* Restricted area arc (small, near basket) */}
      <path d="M 169 27 A 26 26 0 0 1 221 27" fill="none" stroke="white" strokeWidth="1.5" strokeDasharray="4,3" />

      {/* Backboard */}
      <rect x="163" y="5" width="64" height="8" fill="none" stroke="white" strokeWidth="3" />

      {/* Rim */}
      <circle cx="195" cy="27" r="14" fill="none" stroke="#f97316" strokeWidth="3" />

      {/* Net (simple lines) */}
      <line x1="185" y1="41" x2="183" y2="54" stroke="white" strokeWidth="1" opacity="0.5" />
      <line x1="195" y1="41" x2="195" y2="55" stroke="white" strokeWidth="1" opacity="0.5" />
      <line x1="205" y1="41" x2="207" y2="54" stroke="white" strokeWidth="1" opacity="0.5" />

      {/* Overlay children (interactive elements, course path, shot zones, etc.) */}
      {children}
    </svg>
  )
}
