import type { CSSProperties } from "react";

export type Template = {
  id: string;
  name: string;
  style: CSSProperties;
  textColor: "light" | "dark";
};

// Backgrounds inspired by NBA card sets (Prizm, Optic, Mosaic, Select, etc.).
// All pure CSS — no asset hosting needed. Multi-layer gradients give a richer
// look than a single flat gradient.

export const TEMPLATES: Template[] = [
  // ── Warm / red family ──────────────────────────────────────
  {
    id: "red-burst",
    name: "Red Burst",
    style: {
      background:
        "radial-gradient(circle at 50% 45%, #ef4444 0%, #b71c1c 45%, #3f0000 100%)",
    },
    textColor: "light",
  },
  {
    id: "lava",
    name: "Lava",
    style: {
      background:
        "radial-gradient(ellipse at 50% 85%, #fbbf24 0%, #f97316 18%, #ea580c 32%, #991b1b 65%, #0a0000 100%)",
    },
    textColor: "light",
  },
  {
    id: "fire-smoke",
    name: "Fire & Smoke",
    style: {
      background:
        "radial-gradient(ellipse at 50% 100%, #fbbf24 0%, #f97316 12%, transparent 38%), radial-gradient(ellipse at 50% 85%, #dc2626 0%, transparent 45%), linear-gradient(180deg, #000 0%, #1c1917 100%)",
    },
    textColor: "light",
  },

  // ── Gold / yellow ──────────────────────────────────────────
  {
    id: "gold-prestige",
    name: "Gold Prestige",
    style: {
      background:
        "radial-gradient(ellipse at 50% 30%, #fef3c7 0%, #fcd34d 18%, #f59e0b 40%, #92400e 80%, #451a03 100%)",
    },
    textColor: "dark",
  },
  {
    id: "yellow-wedge",
    name: "Yellow Wedge",
    style: {
      background:
        "linear-gradient(115deg, #0f0f0f 0%, #0f0f0f 28%, #fbbf24 28%, #fde047 50%, #fbbf24 72%, #0f0f0f 72%, #0f0f0f 100%)",
    },
    textColor: "dark",
  },

  // ── Cool / blue family ─────────────────────────────────────
  {
    id: "ice",
    name: "Ice",
    style: {
      background:
        "linear-gradient(160deg, #e0f2fe 0%, #38bdf8 28%, #0284c7 60%, #082f49 100%)",
    },
    textColor: "light",
  },
  {
    id: "navy",
    name: "Navy",
    style: {
      background:
        "radial-gradient(ellipse at 50% 30%, #1e40af 0%, #0c1f5c 55%, #020617 100%)",
    },
    textColor: "light",
  },
  {
    id: "tech-grid",
    name: "Tech Grid",
    style: {
      background:
        "linear-gradient(rgba(56,189,248,0.18) 1px, transparent 1px) 0 0 / 28px 28px, linear-gradient(90deg, rgba(56,189,248,0.18) 1px, transparent 1px) 0 0 / 28px 28px, radial-gradient(ellipse at 50% 30%, #0e7490 0%, #082f49 60%, #020617 100%)",
    },
    textColor: "light",
  },

  // ── Purple ─────────────────────────────────────────────────
  {
    id: "royal-purple",
    name: "Royal Purple",
    style: {
      background:
        "radial-gradient(circle at 50% 28%, #c4b5fd 0%, #8b5cf6 20%, #6d28d9 45%, #2e1065 80%, #1e1b4b 100%)",
    },
    textColor: "light",
  },
  {
    id: "sky",
    name: "Sky",
    style: {
      background:
        "linear-gradient(180deg, #1e3a8a 0%, #6366f1 35%, #ec4899 65%, #fcd34d 100%)",
    },
    textColor: "light",
  },

  // ── Green ──────────────────────────────────────────────────
  {
    id: "emerald",
    name: "Emerald",
    style: {
      background:
        "radial-gradient(ellipse at 50% 30%, #6ee7b7 0%, #10b981 24%, #047857 55%, #022c22 100%)",
    },
    textColor: "light",
  },

  // ── Sport-specific ─────────────────────────────────────────
  {
    id: "court",
    name: "Court",
    style: {
      background:
        "linear-gradient(180deg, #c2410c 0%, #d97706 38%, #f59e0b 100%)",
    },
    textColor: "dark",
  },

  // ── Showcase / dramatic ────────────────────────────────────
  {
    id: "starburst",
    name: "Starburst",
    style: {
      background:
        "repeating-conic-gradient(from 0deg at 50% 38%, rgba(255,255,255,0.16) 0deg, transparent 7deg, rgba(255,255,255,0.16) 14deg, transparent 28deg), radial-gradient(circle at 50% 38%, #2a2a2a 0%, #000 80%)",
    },
    textColor: "light",
  },
  {
    id: "prizm",
    name: "Prizm Holo",
    style: {
      background:
        "conic-gradient(from 180deg at 50% 50%, #ff0080 0deg, #ff8000 60deg, #ffd700 120deg, #00ff80 180deg, #0080ff 240deg, #8000ff 300deg, #ff0080 360deg)",
    },
    textColor: "light",
  },
];

export function getTemplate(id: string): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}
