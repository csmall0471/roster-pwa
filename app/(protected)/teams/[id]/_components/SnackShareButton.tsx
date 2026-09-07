"use client";

import { useState } from "react";

// Coach-facing "share the parent snack-signup link" control. The link deep-links
// parents to the team's Schedule & Snacks tab; if they're logged out they sign
// in with their phone first (and are auto-linked to their kids), then land here.
export default function SnackShareButton({ teamId, teamName }: { teamId: string; teamName: string }) {
  const [copied, setCopied] = useState(false);

  // Built on the client so it uses whatever origin the coach is on.
  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/parent/team/${teamId}?tab=schedule`
      : "";

  const message = `Sign up to bring snacks for ${teamName}: ${link}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the visible link can be copied by hand */
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `${teamName} snack signup`, text: message, url: link });
        return;
      } catch {
        /* user cancelled or share unavailable — fall back to copy */
      }
    }
    copy();
  }

  const canNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  return (
    <div className="mt-3 border-t border-gray-100 dark:border-gray-800 pt-3">
      <p className="text-xs font-medium text-gray-600 dark:text-gray-300">Share with parents</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
        Parents open this link, sign in with their phone, and pick a game to bring snacks.
      </p>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-600 dark:text-gray-300"
        />
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
        {canNativeShare && (
          <button
            type="button"
            onClick={share}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Share…
          </button>
        )}
      </div>
    </div>
  );
}
