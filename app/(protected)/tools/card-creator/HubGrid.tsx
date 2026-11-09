"use client";

import type { CSSProperties, ReactNode } from "react";
import { useDuoFold } from "@/app/_components/cardgen/duo-fold";

// The Card Creator page's wrapper. On large touch screens its two columns meet
// at the iPhone Duo's fold rather than the middle of the page, and pop-ups
// (.duo-modal) open on one side of it. `touch-hits` gives every button and link
// on the page a 44pt tap area on touch screens (globals.css).
export default function HubGrid({ className, children }: { className: string; children: ReactNode }) {
  const fold = useDuoFold();
  const style = {
    "--fold-x": fold.x === null ? undefined : `${fold.x}px`,
    "--fold-y": fold.y === null ? undefined : `${fold.y}px`,
  } as CSSProperties;
  return (
    <div className={`touch-hits ${className}`} style={style}>
      {children}
    </div>
  );
}
