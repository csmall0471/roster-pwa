// Curated display fonts for the player-name treatment on the card front.
// Each entry maps to a CSS variable defined in app/layout.tsx via next/font.

export type NameFont = {
  id: string;
  name: string;
  family: string; // CSS font-family value
  em: number; // average uppercase advance width in em (for fit-to-width sizing)
};

export const NAME_FONTS: NameFont[] = [
  {
    id: "anton",
    em: 0.442,
    name: "Anton",
    family: "var(--font-anton), Impact, sans-serif",
  },
  {
    id: "bebas",
    em: 0.361,
    name: "Bebas",
    family: "var(--font-bebas), Impact, sans-serif",
  },
  {
    id: "archivo-black",
    em: 0.706,
    name: "Archivo",
    family: "var(--font-archivo-black), Impact, sans-serif",
  },
  {
    id: "oswald",
    em: 0.5,
    name: "Oswald",
    family: "var(--font-oswald), Impact, sans-serif",
  },
  {
    id: "black-ops",
    em: 0.654,
    name: "Stencil",
    family: "var(--font-black-ops), Impact, sans-serif",
  },
  {
    id: "bungee",
    em: 0.657,
    name: "Bungee",
    family: "var(--font-bungee), Impact, sans-serif",
  },
  {
    id: "marker",
    em: 0.622,
    name: "Marker",
    family: "var(--font-marker), Impact, sans-serif",
  },
];

export function getNameFont(id?: string | null): NameFont {
  return NAME_FONTS.find((f) => f.id === id) ?? NAME_FONTS[0];
}
