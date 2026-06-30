import type { CSSProperties } from "react";

export type TemplateCategory = "solid" | "gradient" | "stripes" | "rainbow" | "pattern";

export type Template = {
  id: string;
  name: string;
  category: TemplateCategory;
  style: CSSProperties;
  textColor: "light" | "dark";
};

// Display order + labels for the grouped background picker.
export const TEMPLATE_CATEGORIES: { key: TemplateCategory; label: string }[] = [
  { key: "solid", label: "Solids" },
  { key: "gradient", label: "Gradients" },
  { key: "stripes", label: "Stripes" },
  { key: "rainbow", label: "Rainbow" },
  { key: "pattern", label: "Patterns" },
];

// Backgrounds inspired by NBA card sets (Prizm, Optic, Mosaic, Select, etc.)
// plus vibrant pop / vaporwave / cosmic looks. All pure CSS — multi-layer
// gradients give a richer feel than single flat gradients. Solids carry a
// gentle top-to-bottom shade so they read as premium stock, not dead flat.

export const TEMPLATES: Template[] = [
  // ── Solids ─────────────────────────────────────────────────
  {
    id: "solid-midnight",
    name: "Midnight",
    category: "solid",
    style: { background: "linear-gradient(180deg, #1d1d1f 0%, #050505 100%)" },
    textColor: "light",
  },
  {
    id: "solid-charcoal",
    name: "Charcoal",
    category: "solid",
    style: { background: "linear-gradient(180deg, #374151 0%, #111827 100%)" },
    textColor: "light",
  },
  {
    id: "solid-slate",
    name: "Slate",
    category: "solid",
    style: { background: "linear-gradient(180deg, #475569 0%, #1e293b 100%)" },
    textColor: "light",
  },
  {
    id: "solid-navy",
    name: "Navy",
    category: "solid",
    style: { background: "linear-gradient(180deg, #1e3a8a 0%, #0b1f4a 100%)" },
    textColor: "light",
  },
  {
    id: "solid-royal",
    name: "Royal Blue",
    category: "solid",
    style: { background: "linear-gradient(180deg, #2563eb 0%, #1538a8 100%)" },
    textColor: "light",
  },
  {
    id: "solid-red",
    name: "Red",
    category: "solid",
    style: { background: "linear-gradient(180deg, #dc2626 0%, #8f1414 100%)" },
    textColor: "light",
  },
  {
    id: "solid-maroon",
    name: "Maroon",
    category: "solid",
    style: { background: "linear-gradient(180deg, #9f1239 0%, #560a1f 100%)" },
    textColor: "light",
  },
  {
    id: "solid-orange",
    name: "Orange",
    category: "solid",
    style: { background: "linear-gradient(180deg, #f97316 0%, #c2410c 100%)" },
    textColor: "light",
  },
  {
    id: "solid-gold",
    name: "Gold",
    category: "solid",
    style: { background: "linear-gradient(180deg, #f6cf52 0%, #d4a017 100%)" },
    textColor: "dark",
  },
  {
    id: "solid-green",
    name: "Green",
    category: "solid",
    style: { background: "linear-gradient(180deg, #16a34a 0%, #14532d 100%)" },
    textColor: "light",
  },
  {
    id: "solid-teal",
    name: "Teal",
    category: "solid",
    style: { background: "linear-gradient(180deg, #14b8a6 0%, #0f766e 100%)" },
    textColor: "light",
  },
  {
    id: "solid-purple",
    name: "Purple",
    category: "solid",
    style: { background: "linear-gradient(180deg, #7c3aed 0%, #4c1d95 100%)" },
    textColor: "light",
  },
  {
    id: "solid-pink",
    name: "Pink",
    category: "solid",
    style: { background: "linear-gradient(180deg, #ec4899 0%, #9d174d 100%)" },
    textColor: "light",
  },
  {
    id: "solid-white",
    name: "White",
    category: "solid",
    style: { background: "linear-gradient(180deg, #ffffff 0%, #dfe4ea 100%)" },
    textColor: "dark",
  },

  // ── Gradients ──────────────────────────────────────────────
  {
    id: "red-burst",
    name: "Red Burst",
    category: "gradient",
    style: {
      background:
        "radial-gradient(circle at 50% 45%, #ef4444 0%, #b71c1c 45%, #3f0000 100%)",
    },
    textColor: "light",
  },
  {
    id: "lava",
    name: "Lava",
    category: "gradient",
    style: {
      background:
        "radial-gradient(ellipse at 50% 85%, #fbbf24 0%, #f97316 18%, #ea580c 32%, #991b1b 65%, #0a0000 100%)",
    },
    textColor: "light",
  },
  {
    id: "inferno",
    name: "Inferno",
    category: "gradient",
    style: {
      background:
        "radial-gradient(circle at 50% 75%, #fde047 0%, #f97316 14%, #dc2626 32%, #7f1d1d 58%, #18181b 100%)",
    },
    textColor: "light",
  },
  {
    id: "fire-smoke",
    name: "Fire & Smoke",
    category: "gradient",
    style: {
      background:
        "radial-gradient(ellipse at 50% 100%, #fbbf24 0%, #f97316 12%, transparent 38%), radial-gradient(ellipse at 50% 85%, #dc2626 0%, transparent 45%), linear-gradient(180deg, #000 0%, #1c1917 100%)",
    },
    textColor: "light",
  },
  {
    id: "sunset",
    name: "Sunset",
    category: "gradient",
    style: {
      background:
        "linear-gradient(180deg, #fca5a5 0%, #fb7185 28%, #f97316 62%, #7c2d12 100%)",
    },
    textColor: "light",
  },
  {
    id: "peach",
    name: "Peach",
    category: "gradient",
    style: {
      background:
        "linear-gradient(160deg, #fed7aa 0%, #fdba74 30%, #fb923c 65%, #ea580c 100%)",
    },
    textColor: "dark",
  },
  {
    id: "gold-prestige",
    name: "Gold Prestige",
    category: "gradient",
    style: {
      background:
        "radial-gradient(ellipse at 50% 30%, #fef3c7 0%, #fcd34d 18%, #f59e0b 40%, #92400e 80%, #451a03 100%)",
    },
    textColor: "dark",
  },
  {
    id: "ice",
    name: "Ice",
    category: "gradient",
    style: {
      background:
        "linear-gradient(160deg, #e0f2fe 0%, #38bdf8 28%, #0284c7 60%, #082f49 100%)",
    },
    textColor: "light",
  },
  {
    id: "steel-blue",
    name: "Steel Blue",
    category: "gradient",
    style: {
      background:
        "linear-gradient(160deg, #93c5fd 0%, #3b82f6 38%, #1e40af 75%, #172554 100%)",
    },
    textColor: "light",
  },
  {
    id: "ocean-depth",
    name: "Ocean Depth",
    category: "gradient",
    style: {
      background:
        "radial-gradient(ellipse at 50% 20%, #22d3ee 0%, #0891b2 30%, #164e63 65%, #042f2e 100%)",
    },
    textColor: "light",
  },
  {
    id: "navy",
    name: "Deep Navy",
    category: "gradient",
    style: {
      background:
        "radial-gradient(ellipse at 50% 30%, #1e40af 0%, #0c1f5c 55%, #020617 100%)",
    },
    textColor: "light",
  },
  {
    id: "royal-purple",
    name: "Royal Purple",
    category: "gradient",
    style: {
      background:
        "radial-gradient(circle at 50% 28%, #c4b5fd 0%, #8b5cf6 20%, #6d28d9 45%, #2e1065 80%, #1e1b4b 100%)",
    },
    textColor: "light",
  },
  {
    id: "aurora",
    name: "Aurora",
    category: "gradient",
    style: {
      background:
        "linear-gradient(135deg, rgba(34,197,94,0.55) 0%, transparent 40%), linear-gradient(225deg, rgba(168,85,247,0.65) 0%, transparent 50%), linear-gradient(180deg, #020617 0%, #0c4a6e 60%, #1e1b4b 100%)",
    },
    textColor: "light",
  },
  {
    id: "sky",
    name: "Sky",
    category: "gradient",
    style: {
      background:
        "linear-gradient(180deg, #1e3a8a 0%, #6366f1 35%, #ec4899 65%, #fcd34d 100%)",
    },
    textColor: "light",
  },
  {
    id: "miami-sunset",
    name: "Miami Sunset",
    category: "gradient",
    style: {
      background:
        "linear-gradient(180deg, #f0abfc 0%, #fb7185 30%, #fb923c 65%, #fde047 100%)",
    },
    textColor: "dark",
  },
  {
    id: "bubblegum",
    name: "Bubblegum",
    category: "gradient",
    style: {
      background:
        "linear-gradient(160deg, #fbcfe8 0%, #f9a8d4 30%, #f472b6 62%, #db2777 100%)",
    },
    textColor: "dark",
  },
  {
    id: "cherry",
    name: "Cherry Blossom",
    category: "gradient",
    style: {
      background:
        "linear-gradient(180deg, #fce7f3 0%, #f9a8d4 28%, #ec4899 68%, #831843 100%)",
    },
    textColor: "dark",
  },
  {
    id: "emerald",
    name: "Emerald",
    category: "gradient",
    style: {
      background:
        "radial-gradient(ellipse at 50% 30%, #6ee7b7 0%, #10b981 24%, #047857 55%, #022c22 100%)",
    },
    textColor: "light",
  },
  {
    id: "mint",
    name: "Mint",
    category: "gradient",
    style: {
      background:
        "linear-gradient(160deg, #d1fae5 0%, #6ee7b7 30%, #10b981 65%, #065f46 100%)",
    },
    textColor: "dark",
  },
  {
    id: "toxic",
    name: "Toxic",
    category: "gradient",
    style: {
      background:
        "radial-gradient(circle at 50% 50%, #d9f99d 0%, #84cc16 22%, #15803d 55%, #052e16 100%)",
    },
    textColor: "light",
  },
  {
    id: "tropical",
    name: "Tropical",
    category: "gradient",
    style: {
      background:
        "radial-gradient(circle at 75% 25%, #fde047 0%, transparent 35%), linear-gradient(180deg, #22d3ee 0%, #0d9488 55%, #134e4a 100%)",
    },
    textColor: "light",
  },

  // ── Stripes ────────────────────────────────────────────────
  {
    id: "tiger",
    name: "Tiger",
    category: "stripes",
    style: {
      background:
        "repeating-linear-gradient(115deg, #0a0a0a 0px, #0a0a0a 30px, #f97316 30px, #f97316 60px)",
    },
    textColor: "light",
  },
  {
    id: "stripe-navy-gold",
    name: "Navy & Gold",
    category: "stripes",
    style: {
      background:
        "repeating-linear-gradient(45deg, #0c1f5c 0px, #0c1f5c 22px, #d4a017 22px, #d4a017 44px)",
    },
    textColor: "light",
  },
  {
    id: "stripe-red-white",
    name: "Red & White",
    category: "stripes",
    style: {
      background:
        "repeating-linear-gradient(45deg, #dc2626 0px, #dc2626 22px, #f8fafc 22px, #f8fafc 44px)",
    },
    textColor: "light",
  },
  {
    id: "stripe-green-white",
    name: "Green & White",
    category: "stripes",
    style: {
      background:
        "repeating-linear-gradient(45deg, #15803d 0px, #15803d 22px, #f8fafc 22px, #f8fafc 44px)",
    },
    textColor: "light",
  },
  {
    id: "stripe-purple",
    name: "Purple Bands",
    category: "stripes",
    style: {
      background:
        "repeating-linear-gradient(125deg, #2e1065 0px, #2e1065 26px, #7c3aed 26px, #7c3aed 52px)",
    },
    textColor: "light",
  },
  {
    id: "stripe-vertical",
    name: "Blue Bars",
    category: "stripes",
    style: {
      background:
        "repeating-linear-gradient(90deg, #1e40af 0px, #1e40af 26px, #2563eb 26px, #2563eb 52px)",
    },
    textColor: "light",
  },
  {
    id: "pinstripe",
    name: "Pinstripe",
    category: "stripes",
    style: {
      background:
        "repeating-linear-gradient(90deg, #0a1733 0px, #0a1733 16px, rgba(255,255,255,0.45) 16px, rgba(255,255,255,0.45) 18px)",
    },
    textColor: "light",
  },
  {
    id: "diagonal-steel",
    name: "Steel Twill",
    category: "stripes",
    style: {
      background:
        "repeating-linear-gradient(115deg, #111827 0px, #111827 28px, #374151 28px, #374151 56px)",
    },
    textColor: "light",
  },
  {
    id: "yellow-wedge",
    name: "Yellow Wedge",
    category: "stripes",
    style: {
      background:
        "linear-gradient(115deg, #0f0f0f 0%, #0f0f0f 28%, #fbbf24 28%, #fde047 50%, #fbbf24 72%, #0f0f0f 72%, #0f0f0f 100%)",
    },
    textColor: "dark",
  },
  {
    id: "pop-art",
    name: "Pop Art",
    category: "stripes",
    style: {
      background:
        "linear-gradient(135deg, #fde047 0%, #fde047 33%, #ef4444 33%, #ef4444 66%, #3b82f6 66%, #3b82f6 100%)",
    },
    textColor: "dark",
  },

  // ── Rainbow / Holo ─────────────────────────────────────────
  {
    id: "prizm",
    name: "Prizm Holo",
    category: "rainbow",
    style: {
      background:
        "conic-gradient(from 180deg at 50% 50%, #ff0080 0deg, #ff8000 60deg, #ffd700 120deg, #00ff80 180deg, #0080ff 240deg, #8000ff 300deg, #ff0080 360deg)",
    },
    textColor: "light",
  },
  {
    id: "rainbow-burst",
    name: "Rainbow Burst",
    category: "rainbow",
    style: {
      background:
        "conic-gradient(from 0deg at 50% 50%, #ef4444, #f59e0b, #fde047, #22c55e, #06b6d4, #6366f1, #ec4899, #ef4444)",
    },
    textColor: "light",
  },
  {
    id: "holo-sheen",
    name: "Holographic",
    category: "rainbow",
    style: {
      background:
        "linear-gradient(115deg, #ff6ec4 0%, #ffae6e 18%, #fff36e 36%, #6effa0 54%, #6ec8ff 72%, #b06eff 90%, #ff6ec4 100%)",
    },
    textColor: "light",
  },
  {
    id: "rainbow-stripes",
    name: "Rainbow Stripes",
    category: "rainbow",
    style: {
      background:
        "linear-gradient(180deg, #ef4444 0%, #f59e0b 18%, #fde047 36%, #22c55e 54%, #06b6d4 72%, #6366f1 88%, #a855f7 100%)",
    },
    textColor: "light",
  },
  {
    id: "pastel-holo",
    name: "Pastel Holo",
    category: "rainbow",
    style: {
      background:
        "linear-gradient(135deg, #fbcfe8 0%, #c7d2fe 25%, #bae6fd 50%, #bbf7d0 72%, #fef08a 100%)",
    },
    textColor: "dark",
  },

  // ── Patterns ───────────────────────────────────────────────
  {
    id: "tech-grid",
    name: "Tech Grid",
    category: "pattern",
    style: {
      background:
        "linear-gradient(rgba(56,189,248,0.18) 1px, transparent 1px) 0 0 / 28px 28px, linear-gradient(90deg, rgba(56,189,248,0.18) 1px, transparent 1px) 0 0 / 28px 28px, radial-gradient(ellipse at 50% 30%, #0e7490 0%, #082f49 60%, #020617 100%)",
    },
    textColor: "light",
  },
  {
    id: "dots",
    name: "Polka Dots",
    category: "pattern",
    style: {
      background:
        "radial-gradient(rgba(255,255,255,0.22) 2px, transparent 2.5px) 0 0 / 22px 22px, linear-gradient(180deg, #1e3a8a 0%, #111827 100%)",
    },
    textColor: "light",
  },
  {
    id: "galaxy",
    name: "Galaxy",
    category: "pattern",
    style: {
      background:
        "radial-gradient(ellipse at 30% 20%, #c084fc 0%, transparent 30%), radial-gradient(ellipse at 70% 60%, #06b6d4 0%, transparent 35%), radial-gradient(circle at 50% 50%, #581c87 0%, #1e1b4b 50%, #020617 100%)",
    },
    textColor: "light",
  },
  {
    id: "synthwave",
    name: "Synthwave",
    category: "pattern",
    style: {
      background:
        "linear-gradient(rgba(244,114,182,0.35) 1px, transparent 1px) 0 0 / 42px 42px, linear-gradient(90deg, rgba(244,114,182,0.35) 1px, transparent 1px) 0 0 / 42px 42px, linear-gradient(180deg, #1e1b4b 0%, #831843 55%, #fb923c 85%, #fde047 100%)",
    },
    textColor: "light",
  },
  {
    id: "magenta-rays",
    name: "Magenta Rays",
    category: "pattern",
    style: {
      background:
        "repeating-conic-gradient(from 0deg at 50% 50%, #831843 0deg, #ec4899 8deg, #831843 16deg, #f472b6 24deg)",
    },
    textColor: "light",
  },
  {
    id: "cyber-neon",
    name: "Cyber Neon",
    category: "pattern",
    style: {
      background:
        "radial-gradient(circle at 28% 28%, #ec4899 0%, transparent 50%), radial-gradient(circle at 72% 72%, #06b6d4 0%, transparent 50%), linear-gradient(135deg, #1e1b4b 0%, #000 100%)",
    },
    textColor: "light",
  },
  {
    id: "starburst",
    name: "Starburst",
    category: "pattern",
    style: {
      background:
        "repeating-conic-gradient(from 0deg at 50% 38%, rgba(255,255,255,0.16) 0deg, transparent 7deg, rgba(255,255,255,0.16) 14deg, transparent 28deg), radial-gradient(circle at 50% 38%, #2a2a2a 0%, #000 80%)",
    },
    textColor: "light",
  },
  {
    id: "carbon",
    name: "Carbon Fiber",
    category: "pattern",
    style: {
      background:
        "repeating-linear-gradient(45deg, #1f2937 0px, #1f2937 4px, #0f172a 4px, #0f172a 8px), repeating-linear-gradient(-45deg, transparent 0px, transparent 4px, rgba(255,255,255,0.06) 4px, rgba(255,255,255,0.06) 8px)",
    },
    textColor: "light",
  },
  {
    id: "court",
    name: "Court",
    category: "pattern",
    style: {
      background:
        "linear-gradient(180deg, #c2410c 0%, #d97706 38%, #f59e0b 100%)",
    },
    textColor: "dark",
  },
];

export function getTemplate(id: string): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}
