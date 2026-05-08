"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed) return;
    // Already installed as standalone
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isIos && isSafari) {
      setShowIos(true);
      return;
    }

    function onPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [dismissed]);

  if (dismissed || (!deferredPrompt && !showIos)) return null;

  if (showIos) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-40 bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-4">
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 text-lg leading-none"
          aria-label="Dismiss"
        >×</button>
        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Add to Home Screen</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Tap <strong>Share</strong> <span className="text-base">⎙</span> at the bottom of Safari, then <strong>Add to Home Screen</strong> to install this app.
        </p>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
      <span className="text-2xl">🏀</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Install the app</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">Add to your home screen for quick access</p>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={() => setDismissed(true)}
          className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
        >Not now</button>
        <button
          onClick={async () => {
            if (!deferredPrompt) return;
            await deferredPrompt.prompt();
            setDeferredPrompt(null);
          }}
          className="text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition-colors"
        >Install</button>
      </div>
    </div>
  );
}
