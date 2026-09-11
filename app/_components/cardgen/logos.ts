// Built-in team logo presets — transparent PNGs served from /public/card-logos.
// Coaches pick one with a tap (no upload) or upload their own; both paths set
// the same `logo` layer on the card. To add a preset, drop a transparent PNG in
// public/card-logos and add a row here.
export type LogoPreset = { id: string; name: string; url: string };

export const LOGO_PRESETS: LogoPreset[] = [
  { id: "showtime", name: "Showtime", url: "/card-logos/showtime.png" },
  { id: "primetime", name: "Primetime", url: "/card-logos/primetime.png" },
  { id: "seahawks", name: "Seahawks", url: "/card-logos/seahawks.png" },
];
