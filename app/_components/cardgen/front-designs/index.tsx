// Registry of card-front designs. Each design draws the team block, jersey
// number, player name and (optionally) coaches as one matched set. See
// ./shared.tsx for the contract and the export/print rules.

import { classic } from "./classic";
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

export const FRONT_DESIGNS: FrontDesign[] = [classic, racing, ribbon, scoreboard, pill, varsity, stamp, sidebar, marker, minimal];

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
