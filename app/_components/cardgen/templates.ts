import type { CSSProperties } from "react";

export type Template = {
  id: string;
  name: string;
  style: CSSProperties;
  textColor: "light" | "dark";
};

// Backgrounds inspired by NBA card sets (Prizm, Optic, Mosaic, Select, etc.)
// plus vibrant pop / vaporwave / cosmic looks. All pure CSS — multi-layer
// gradients give a richer feel than single flat gradients.

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
    id: "inferno",
    name: "Inferno",
    style: {
      background:
        "radial-gradient(circle at 50% 75%, #fde047 0%, #f97316 14%, #dc2626 32%, #7f1d1d 58%, #18181b 100%)",
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
  {
    id: "tiger",
    name: "Tiger",
    style: {
      background:
        "repeating-linear-gradient(115deg, #0a0a0a 0px, #0a0a0a 30px, #f97316 30px, #f97316 60px)",
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
    id: "ocean-depth",
    name: "Ocean Depth",
    style: {
      background:
        "radial-gradient(ellipse at 50% 20%, #22d3ee 0%, #0891b2 30%, #164e63 65%, #042f2e 100%)",
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

  // ── Purple / cosmic ────────────────────────────────────────
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
    id: "galaxy",
    name: "Galaxy",
    style: {
      background:
        "radial-gradient(ellipse at 30% 20%, #c084fc 0%, transparent 30%), radial-gradient(ellipse at 70% 60%, #06b6d4 0%, transparent 35%), radial-gradient(circle at 50% 50%, #581c87 0%, #1e1b4b 50%, #020617 100%)",
    },
    textColor: "light",
  },
  {
    id: "aurora",
    name: "Aurora",
    style: {
      background:
        "linear-gradient(135deg, rgba(34,197,94,0.55) 0%, transparent 40%), linear-gradient(225deg, rgba(168,85,247,0.65) 0%, transparent 50%), linear-gradient(180deg, #020617 0%, #0c4a6e 60%, #1e1b4b 100%)",
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

  // ── Pink / sunset ──────────────────────────────────────────
  {
    id: "miami-sunset",
    name: "Miami Sunset",
    style: {
      background:
        "linear-gradient(180deg, #f0abfc 0%, #fb7185 30%, #fb923c 65%, #fde047 100%)",
    },
    textColor: "dark",
  },
  {
    id: "synthwave",
    name: "Synthwave",
    style: {
      background:
        "linear-gradient(rgba(244,114,182,0.35) 1px, transparent 1px) 0 0 / 42px 42px, linear-gradient(90deg, rgba(244,114,182,0.35) 1px, transparent 1px) 0 0 / 42px 42px, linear-gradient(180deg, #1e1b4b 0%, #831843 55%, #fb923c 85%, #fde047 100%)",
    },
    textColor: "light",
  },
  {
    id: "magenta-rays",
    name: "Magenta Rays",
    style: {
      background:
        "repeating-conic-gradient(from 0deg at 50% 50%, #831843 0deg, #ec4899 8deg, #831843 16deg, #f472b6 24deg)",
    },
    textColor: "light",
  },
  {
    id: "cherry",
    name: "Cherry Blossom",
    style: {
      background:
        "linear-gradient(180deg, #fce7f3 0%, #f9a8d4 28%, #ec4899 68%, #831843 100%)",
    },
    textColor: "dark",
  },
  {
    id: "cyber-neon",
    name: "Cyber Neon",
    style: {
      background:
        "radial-gradient(circle at 28% 28%, #ec4899 0%, transparent 50%), radial-gradient(circle at 72% 72%, #06b6d4 0%, transparent 50%), linear-gradient(135deg, #1e1b4b 0%, #000 100%)",
    },
    textColor: "light",
  },

  // ── Green family ───────────────────────────────────────────
  {
    id: "emerald",
    name: "Emerald",
    style: {
      background:
        "radial-gradient(ellipse at 50% 30%, #6ee7b7 0%, #10b981 24%, #047857 55%, #022c22 100%)",
    },
    textColor: "light",
  },
  {
    id: "toxic",
    name: "Toxic",
    style: {
      background:
        "radial-gradient(circle at 50% 50%, #d9f99d 0%, #84cc16 22%, #15803d 55%, #052e16 100%)",
    },
    textColor: "light",
  },
  {
    id: "tropical",
    name: "Tropical",
    style: {
      background:
        "radial-gradient(circle at 75% 25%, #fde047 0%, transparent 35%), linear-gradient(180deg, #22d3ee 0%, #0d9488 55%, #134e4a 100%)",
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
  {
    id: "rainbow-burst",
    name: "Rainbow Burst",
    style: {
      background:
        "conic-gradient(from 0deg at 50% 50%, #ef4444, #f59e0b, #fde047, #22c55e, #06b6d4, #6366f1, #ec4899, #ef4444)",
    },
    textColor: "light",
  },
  {
    id: "pop-art",
    name: "Pop Art",
    style: {
      background:
        "linear-gradient(135deg, #fde047 0%, #fde047 33%, #ef4444 33%, #ef4444 66%, #3b82f6 66%, #3b82f6 100%)",
    },
    textColor: "dark",
  },
  {
    id: "carbon",
    name: "Carbon Fiber",
    style: {
      background:
        "repeating-linear-gradient(45deg, #1f2937 0px, #1f2937 4px, #0f172a 4px, #0f172a 8px), repeating-linear-gradient(-45deg, transparent 0px, transparent 4px, rgba(255,255,255,0.06) 4px, rgba(255,255,255,0.06) 8px)",
    },
    textColor: "light",
  },
];

export function getTemplate(id: string): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}
