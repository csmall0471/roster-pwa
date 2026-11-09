// Registry of card-front designs. Each design draws the team block, jersey
// number, player name and (optionally) coaches as one matched set. See
// ./shared.tsx for the contract and the export/print rules.

import { classic } from "./classic";
// Back themes are attached here rather than in each design file: every
// <id>-back.tsx imports helpers from its <id>.tsx, so having <id>.tsx import
// its back too would make a circular import.
import { racingBack } from "./racing-back";
import { ribbonBack } from "./ribbon-back";
import { scoreboardBack } from "./scoreboard-back";
import { pillBack } from "./pill-back";
import { varsityBack } from "./varsity-back";
import { stampBack } from "./stamp-back";
import { sidebarBack } from "./sidebar-back";
import { markerBack } from "./marker-back";
import { minimalBack } from "./minimal-back";
import { racing } from "./racing";
import { ribbon } from "./ribbon";
import { scoreboard } from "./scoreboard";
import { pill } from "./pill";
import { varsity } from "./varsity";
import { stamp } from "./stamp";
import { sidebar } from "./sidebar";
import { marker } from "./marker";
import { minimal } from "./minimal";
import { defaultCirculation, type FrontDesign, type FrontDesignProps } from "./shared";

export const DEFAULT_FRONT_DESIGN = "chevron";

export const FRONT_DESIGNS: FrontDesign[] = [
  classic,
  { ...racing, back: racingBack },
  { ...ribbon, back: ribbonBack },
  { ...scoreboard, back: scoreboardBack },
  { ...pill, back: pillBack },
  { ...varsity, back: varsityBack },
  { ...stamp, back: stampBack },
  { ...sidebar, back: sidebarBack },
  { ...marker, back: markerBack },
  { ...minimal, back: minimalBack },
];

export function getFrontDesign(id: string | null | undefined): FrontDesign {
  return FRONT_DESIGNS.find((d) => d.id === id) ?? classic;
}

export function FrontDesignLayer({ designId, ...p }: FrontDesignProps & { designId: string | null | undefined }) {
  return <>{getFrontDesign(designId).render(p)}</>;
}

export function circulationPosition(designId: string | null | undefined, p: FrontDesignProps) {
  const d = getFrontDesign(designId);
  return (d.circulation ?? defaultCirculation)(p);
}

export * from "./shared";
