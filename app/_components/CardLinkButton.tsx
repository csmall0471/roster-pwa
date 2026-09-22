"use client";

import { useState } from "react";

// Coach-facing "send this kid's parent a card link" control. The link deep-links
// the parent straight into the Card Creator for their own child, prefilled with
// the player + team (name, stats, season). If they're logged out they sign in
// with their phone first (and are auto-linked to their kids), then land on the
// prefilled card — no "Whose card is this?" step, since the kid is already known.
//
// Built on the client so it uses whatever origin the coach is on. Tries the
// native share sheet first (great on a phone), and always falls back to copying
// the URL to the clipboard.
export default function CardLinkButton({
  playerId,
  teamId = null,
  playerName,
  label = "Card link",
  className,
}: {
  playerId: string;
  teamId?: string | null;
  playerName: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  function buildLink() {
    if (typeof window === "undefined") return "";
    const base = `${window.location.origin}/parent/player/${playerId}/card`;
    return teamId ? `${base}?team=${teamId}` : base;
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      /* clipboard blocked — nothing else we can do silently */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleClick() {
    const link = buildLink();
    if (!link) return;
    const message = `Make ${playerName}'s player card here: ${link}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: `${playerName}'s card`, text: message, url: link });
        return;
      } catch {
        /* cancelled or unavailable — fall back to copy */
      }
    }
    copyLink(link);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={`Copy a link for ${playerName}'s parent to build this card, prefilled`}
      className={
        className ??
        "rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      }
    >
      {copied ? "Copied!" : label}
    </button>
  );
}
