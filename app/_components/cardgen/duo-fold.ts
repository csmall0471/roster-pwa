"use client";

import { useEffect, useSyncExternalStore } from "react";

// Where the iPhone Duo's fold sits in the page, so the full-screen card editor
// can put the card on one side of it and the tools on the other.
//
// The fold runs down the middle of the inner screen's long side: a vertical line
// when it's held wide, a horizontal one when it's held tall. Safari gives a flat
// phone no fold signal (the Viewport Segments API is behind a flag, and a flat
// fold has zero width anyway), so it's worked out from the screen size. Held
// wide, the Home Screen app loses an ~84pt strip on the camera side, so the
// page's centre isn't the fold: with the strip on the right (as measured on the
// owner's Duo) the fold is at the screen's middle, ~42pt right of the page's.
//
// Anything without a usable screen size (an iPad, a desktop window, a test
// iframe) falls back to the middle of the page.
//
// Testing: ?fold=475 puts the fold at x=475, ?fold=y420 at y=420; ?kb=300 fakes a
// 300px on-screen keyboard; ?debug=layout shows the numbers on screen.

export type Fold = { x: number | null; y: number | null };

// Large touch screens: the iPhone Duo unfolded and iPads. Must match the
// `unfolded` variant in globals.css. Everywhere else the hooks below stay idle,
// so phones and desktops never re-render for them.
export const UNFOLDED_QUERY =
  "(min-width: 600px) and (max-width: 1023.98px) and (min-height: 480px), (min-width: 1024px) and (min-height: 480px) and (pointer: coarse)";

let unfoldedMql: MediaQueryList | null = null;
function unfolded(): boolean {
  unfoldedMql ??= window.matchMedia(UNFOLDED_QUERY);
  return unfoldedMql.matches;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function param(name: string): string | null {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

export function computeFold(): Fold {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const forced = param("fold");
  if (forced) {
    const n = Number(forced.replace(/^[xy]/, ""));
    if (Number.isFinite(n)) return forced.startsWith("y") ? { x: null, y: n } : { x: n, y: null };
  }

  // A folded foldable that exposes its two halves (Chrome on Android, Safari
  // with the Viewport Segments flag on).
  const segments = (window as { viewport?: { segments?: DOMRect[] | null } }).viewport?.segments;
  if (segments && segments.length === 2) {
    const [a, b] = segments;
    return b.left >= a.right ? { x: (a.right + b.left) / 2, y: null } : { x: null, y: (a.bottom + b.top) / 2 };
  }

  const long = Math.max(window.screen.width, window.screen.height);
  if (vw >= vh) {
    // Held wide: whatever the page is missing from the screen's width is the
    // side strip. It sits on the camera side, which is the left only when the
    // phone is turned so its top points left (angle 90).
    const missing = long - vw;
    if (missing < 0 || missing > 120) return { x: vw / 2, y: null };
    const angle =
      window.screen.orientation?.angle ??
      (window as { orientation?: number }).orientation ??
      0;
    const stripOnLeft = missing > 20 && angle === 90;
    return { x: long / 2 - (stripOnLeft ? missing : 0), y: null };
  }
  // Held tall: in the Home Screen app only the status bar sits above the page.
  // In Safari the bar can be above or below it, so take the page's middle.
  const missing = long - vh;
  if (!isStandalone() || missing < 0 || missing > 200) return { x: null, y: vh / 2 };
  return { x: null, y: long / 2 - missing };
}

function subscribeLayout(onChange: () => void) {
  unfolded();
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  window.screen.orientation?.addEventListener?.("change", onChange);
  unfoldedMql?.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
    window.screen.orientation?.removeEventListener?.("change", onChange);
    unfoldedMql?.removeEventListener("change", onChange);
  };
}

function foldSnapshot(): string {
  if (!unfolded()) return "|";
  const f = computeFold();
  return `${f.x === null ? "" : Math.round(f.x)}|${f.y === null ? "" : Math.round(f.y)}`;
}

export function useDuoFold(): Fold {
  const snap = useSyncExternalStore(subscribeLayout, foldSnapshot, () => "|");
  const [x, y] = snap.split("|");
  return { x: x === "" ? null : Number(x), y: y === "" ? null : Number(y) };
}

// The on-screen keyboard. iOS shrinks only the visual viewport for it, so a
// full-screen fixed editor keeps its height and the keyboard covers its lower
// half. While a text field in the editor is focused and the keyboard is up, this
// returns the visible area so the editor can fit itself into it.
export type Keyboard = { top: number; height: number } | null;

function isTextField(el: Element | null): boolean {
  if (!el || !el.closest(".card-fullscreen")) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  return !["range", "checkbox", "radio", "file", "color", "button", "submit"].includes(el.type);
}

function keyboardSnapshot(): string {
  if (!unfolded()) return "";
  const fake = Number(param("kb"));
  if (fake > 0 && isTextField(document.activeElement)) {
    return `0|${Math.round(window.innerHeight - fake)}`;
  }
  const vv = window.visualViewport;
  if (!vv || !isTextField(document.activeElement)) return "";
  if (vv.height > window.innerHeight - 100) return "";
  return `${Math.round(vv.offsetTop)}|${Math.round(vv.height)}`;
}

function subscribeKeyboard(onChange: () => void) {
  unfolded();
  const vv = window.visualViewport;
  vv?.addEventListener("resize", onChange);
  vv?.addEventListener("scroll", onChange);
  // No focusout: moving between fields blurs one before focusing the next, and
  // the keyboard stays up through it. Closing the keyboard resizes the viewport.
  document.addEventListener("focusin", onChange);
  unfoldedMql?.addEventListener("change", onChange);
  // A faked keyboard (?kb=) never resizes anything, so leaving the field has to
  // re-check, once focus has settled.
  const fake = Number(param("kb")) > 0;
  const onFocusOut = () => setTimeout(onChange, 0);
  if (fake) document.addEventListener("focusout", onFocusOut);
  return () => {
    vv?.removeEventListener("resize", onChange);
    vv?.removeEventListener("scroll", onChange);
    document.removeEventListener("focusin", onChange);
    unfoldedMql?.removeEventListener("change", onChange);
    if (fake) document.removeEventListener("focusout", onFocusOut);
  };
}

export function useKeyboard(): Keyboard {
  const snap = useSyncExternalStore(subscribeKeyboard, keyboardSnapshot, () => "");
  if (!snap) return null;
  const [top, height] = snap.split("|").map(Number);
  return { top, height };
}

// Screen check: the switch in Card options (large touch screens, coach only),
// for testing on a phone where the address can't be edited, like the Home
// Screen app. It shows the ?debug=layout numbers and runs the ?cover=1 test
// below, and lasts until the app is closed. The URL parameters still work in
// a browser.
const SCREEN_CHECK_KEY = "duo-screen-check";
const screenCheckListeners = new Set<() => void>();
let screenCheckOn: boolean | null = null;

function readScreenCheck(): boolean {
  if (screenCheckOn === null) {
    try {
      screenCheckOn = window.sessionStorage.getItem(SCREEN_CHECK_KEY) === "1";
    } catch {
      screenCheckOn = false;
    }
  }
  return screenCheckOn;
}

export function setScreenCheck(on: boolean) {
  screenCheckOn = on;
  try {
    if (on) window.sessionStorage.setItem(SCREEN_CHECK_KEY, "1");
    else window.sessionStorage.removeItem(SCREEN_CHECK_KEY);
  } catch {
    // Private mode: it still works until the page reloads.
  }
  screenCheckListeners.forEach((l) => l());
}

function subscribeScreenCheck(onChange: () => void) {
  screenCheckListeners.add(onChange);
  return () => {
    screenCheckListeners.delete(onChange);
  };
}

function debugSnapshot(): boolean {
  return param("debug") === "layout" || readScreenCheck();
}

function coverSnapshot(): boolean {
  return param("cover") === "1" || readScreenCheck();
}

export function useDuoDebug(): boolean {
  return useSyncExternalStore(subscribeScreenCheck, debugSnapshot, () => false);
}

// The strip test (?cover=1 or Screen check): lets the page run under iOS's
// side strip (viewport-fit=cover) while the full-screen editor is open, so the
// readout shows whether the strip's inset is reported. If it is, the card
// tools' bar could move into the strip itself. The editor pads each side by
// its own inset, so nothing lands under the clock.
export function useViewportCoverTest(active: boolean) {
  const on = useSyncExternalStore(subscribeScreenCheck, coverSnapshot, () => false);
  useEffect(() => {
    if (!active || !on) return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta || /viewport-fit/.test(meta.content)) return;
    const before = meta.content;
    meta.content = `${before}, viewport-fit=cover`;
    return () => {
      meta.content = before;
    };
  }, [active, on]);
}

function safeAreaText(): string {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const [t, r, b, l] = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map((v) =>
    Math.round(parseFloat(v) || 0)
  );
  probe.remove();
  return `safe area t${t} r${r} b${b} l${l}`;
}

let pageBeforeCover: string | null = null;

// What the readout prints (?debug=layout or Screen check).
export function duoDebugText(fold: Fold, keyboard: Keyboard): string {
  const vv = window.visualViewport;
  const cover = /viewport-fit=cover/.test(
    document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? ""
  );
  if (!cover && pageBeforeCover === null) pageBeforeCover = `${window.innerWidth}x${window.innerHeight}`;
  const angle = window.screen.orientation?.angle ?? (window as { orientation?: number }).orientation;
  const segments = (window as { viewport?: { segments?: DOMRect[] | null } }).viewport?.segments;
  const standalone = isStandalone();
  return [
    `page ${window.innerWidth}x${window.innerHeight}  screen ${window.screen.width}x${window.screen.height}  angle ${angle ?? "?"}`,
    `visual ${vv ? `${Math.round(vv.width)}x${Math.round(vv.height)} top ${Math.round(vv.offsetTop)}` : "n/a"}  segments ${segments?.length ?? "n/a"}`,
    `fold x ${fold.x ?? "-"}  y ${fold.y ?? "-"}  keyboard ${keyboard ? `${keyboard.height}@${keyboard.top}` : "no"}  ${standalone ? "home screen app" : "browser"}`,
    `${safeAreaText()}  strip test ${cover ? "on" : "off"}  page before ${pageBeforeCover ?? "?"}`,
    `dpr ${window.devicePixelRatio}  avail ${window.screen.availWidth}x${window.screen.availHeight}  outer ${window.outerWidth}x${window.outerHeight}  ${window.matchMedia("(pointer: coarse)").matches ? "touch" : "mouse"}`,
  ].join("\n");
}

