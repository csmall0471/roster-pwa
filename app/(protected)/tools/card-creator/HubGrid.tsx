"use client";

import type { CSSProperties, ReactNode } from "react";
import { useDuoFold } from "@/app/_components/cardgen/duo-fold";

// The Card Creator page's wrapper. On large touch screens its two columns meet
// at the iPhone Duo's fold rather than the middle of the page.
export default function HubGrid({ className, children }: { className: string; children: ReactNode }) {
  const fold = useDuoFold();
  const style = { "--fold-x": fold.x === null ? undefined : `${fold.x}px` } as CSSProperties;
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}
