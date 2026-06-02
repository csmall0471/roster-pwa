"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Pull-to-refresh for installed-PWA mode. Native browsers have their own
// PTR on Android Chrome and nothing on iOS Safari, but standalone PWAs
// suppress all of it — so we draw our own.

const TRIGGER_PX = 70; // pull distance to fire a refresh
const MAX_PULL_PX = 120; // cap so the indicator doesn't grow forever
const RESISTANCE = 0.55; // how much actual finger travel becomes pull
const REFRESH_HOLD_MS = 700; // how long the spinner stays after firing

export default function PullToRefresh() {
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Refs for handlers to avoid re-attaching listeners every state change.
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  // Activate only when launched as an installed PWA (standalone display).
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean })
        .standalone === true;
    setEnabled(standalone);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    function reset() {
      startY.current = null;
      pullRef.current = 0;
      setPull(0);
    }

    function onTouchStart(e: TouchEvent) {
      if (refreshingRef.current) return;
      if (e.touches.length !== 1) return;
      if (window.scrollY > 0) return;
      // Let opt-out elements (e.g. card-editor drag handles) suppress PTR.
      const target = e.target as Element | null;
      if (target?.closest?.("[data-no-ptr]")) return;
      startY.current = e.touches[0].clientY;
    }

    function onTouchMove(e: TouchEvent) {
      if (refreshingRef.current || startY.current === null) return;
      if (window.scrollY > 0) {
        reset();
        return;
      }
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        if (pullRef.current > 0) {
          pullRef.current = 0;
          setPull(0);
        }
        return;
      }
      const p = Math.min(MAX_PULL_PX, dy * RESISTANCE);
      pullRef.current = p;
      setPull(p);
    }

    function onTouchEnd() {
      if (refreshingRef.current || startY.current === null) {
        startY.current = null;
        return;
      }
      startY.current = null;
      if (pullRef.current >= TRIGGER_PX) {
        refreshingRef.current = true;
        setRefreshing(true);
        setPull(60);
        pullRef.current = 60;
        router.refresh();
        setTimeout(() => {
          refreshingRef.current = false;
          setRefreshing(false);
          pullRef.current = 0;
          setPull(0);
        }, REFRESH_HOLD_MS);
      } else {
        pullRef.current = 0;
        setPull(0);
      }
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchcancel", onTouchEnd);
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, router]);

  if (!enabled || (pull === 0 && !refreshing)) return null;

  const ready = pull >= TRIGGER_PX;
  const opacity = Math.min(1, pull / TRIGGER_PX);

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: pull,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 100,
        opacity,
        transition: refreshing ? "height 150ms ease" : "none",
      }}
    >
      <div
        className={`w-8 h-8 rounded-full border-2 ${
          refreshing
            ? "border-blue-500 border-t-transparent animate-spin"
            : ready
              ? "border-blue-500 border-t-transparent"
              : "border-gray-400 border-t-transparent"
        }`}
        style={{
          transform: refreshing ? undefined : `rotate(${pull * 4}deg)`,
          transition: "border-color 120ms ease",
        }}
      />
    </div>
  );
}
