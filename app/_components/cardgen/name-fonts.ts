// Curated display fonts for the player-name treatment on the card front.
// Each entry maps to a CSS variable defined in app/layout.tsx via next/font.

export type NameFont = {
  id: string;
  name: string;
  family: string; // CSS font-family value
};

export const NAME_FONTS: NameFont[] = [
  {
    id: "anton",
    name: "Anton",
    family: "var(--font-anton), Impact, sans-serif",
  },
  {
    id: "bebas",
    name: "Bebas",
    family: "var(--font-bebas), Impact, sans-serif",
  },
  {
    id: "archivo-black",
    name: "Archivo",
    family: "var(--font-archivo-black), Impact, sans-serif",
  },
  {
    id: "oswald",
    name: "Oswald",
    family: "var(--font-oswald), Impact, sans-serif",
  },
  {
    id: "black-ops",
    name: "Stencil",
    family: "var(--font-black-ops), Impact, sans-serif",
  },
  {
    id: "bungee",
    name: "Bungee",
    family: "var(--font-bungee), Impact, sans-serif",
  },
  {
    id: "marker",
    name: "Marker",
    family: "var(--font-marker), Impact, sans-serif",
  },
];

export function getNameFont(id?: string | null): NameFont {
  return NAME_FONTS.find((f) => f.id === id) ?? NAME_FONTS[0];
}
