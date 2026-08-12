import type { CardSport } from "@/lib/types";
import type { TemplateCategory } from "./templates";

// Per-sport configuration for the card creator: which backgrounds to show, the
// position options + their card-back abbreviations, and the two questionnaire
// fields whose wording changes by sport. Everything else on the card is
// sport-neutral. Extend SPORTS to add a sport; the UI derives from this map.

export type { CardSport };

type PositionOption = { value: string; label: string };

// Wording for a questionnaire field that reads differently per sport.
type QLabel = { editor: string; back: string; placeholder: string };

export type SportConfig = {
  id: CardSport;
  label: string;
  // Background categories to offer, in display order. Categories not listed are
  // hidden for this sport (e.g. a football card never shows Basketball styles).
  backgroundCategories: TemplateCategory[];
  // Auto-selected when switching to this sport if the current background isn't
  // one this sport offers.
  defaultBackgroundId: string;
  positions: PositionOption[];
  // Lower-cased full position → short badge shown on the card back ("POS").
  positionAbbrev: Record<string, string>;
  qLabels: {
    signature_move: QLabel;
    favorite_drill: QLabel;
  };
};

export const SPORTS: Record<CardSport, SportConfig> = {
  basketball: {
    id: "basketball",
    label: "Basketball",
    backgroundCategories: ["basketball", "solid", "gradient", "stripes", "rainbow", "pattern"],
    defaultBackgroundId: "solid-midnight",
    positions: [
      { value: "GUARD", label: "Guard" },
      { value: "FORWARD", label: "Forward" },
      { value: "CENTER", label: "Center" },
      { value: "UTILITY", label: "Utility" },
    ],
    positionAbbrev: {
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
    },
    qLabels: {
      signature_move: { editor: "Signature move", back: "SIG MOVE", placeholder: "Step-back" },
      favorite_drill: { editor: "Fav practice drill", back: "FAV DRILL", placeholder: "Suicides" },
    },
  },
  football: {
    id: "football",
    label: "Football",
    backgroundCategories: ["football", "solid", "gradient"],
    defaultBackgroundId: "fb-gridiron",
    positions: [
      { value: "QUARTERBACK", label: "Quarterback" },
      { value: "RUNNING BACK", label: "Running back" },
      { value: "WIDE RECEIVER", label: "Wide receiver" },
      { value: "TIGHT END", label: "Tight end" },
      { value: "OFFENSIVE LINE", label: "Offensive line" },
      { value: "DEFENSIVE LINE", label: "Defensive line" },
      { value: "LINEBACKER", label: "Linebacker" },
      { value: "CORNERBACK", label: "Cornerback" },
      { value: "SAFETY", label: "Safety" },
      { value: "KICKER", label: "Kicker" },
      { value: "PUNTER", label: "Punter" },
      { value: "ATHLETE", label: "Athlete" },
    ],
    positionAbbrev: {
      quarterback: "QB",
      "running back": "RB",
      "wide receiver": "WR",
      "tight end": "TE",
      "offensive line": "OL",
      "offensive lineman": "OL",
      "defensive line": "DL",
      "defensive lineman": "DL",
      linebacker: "LB",
      cornerback: "CB",
      "defensive back": "DB",
      safety: "S",
      "free safety": "FS",
      "strong safety": "SS",
      kicker: "K",
      punter: "P",
      athlete: "ATH",
    },
    qLabels: {
      signature_move: { editor: "TD celebration", back: "TD CELEB", placeholder: "Griddy, spike, Lambeau leap…" },
      favorite_drill: { editor: "Favorite play", back: "FAV PLAY", placeholder: "Hail Mary" },
    },
  },
};

export const CARD_SPORTS: CardSport[] = ["basketball", "football"];

export function getSport(id: string | null | undefined): SportConfig {
  return (id && SPORTS[id as CardSport]) || SPORTS.basketball;
}

// Map a team's freeform sport text (teams.sport) to a supported card sport.
export function sportFromTeam(sport: string | null | undefined): CardSport {
  return (sport ?? "").toLowerCase().includes("foot") ? "football" : "basketball";
}

// Short position badge for the card back, using the sport's abbreviation map.
export function abbreviatePositionFor(id: string | null | undefined, pos: string): string {
  const key = pos.trim().toLowerCase().replace(/\s+/g, " ");
  return getSport(id).positionAbbrev[key] ?? pos;
}
