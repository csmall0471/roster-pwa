// Print export geometry: a 2.5×3.5" card centered in a 2.6×3.6" canvas (0.05"
// bleed all around) at 350 DPI.
//
// Bleed is added by EDGE-EXTENSION, not by scaling the design up: the trim
// artwork stays at its designed size in the center (so content keeps its full
// safe-zone margin), and the background is pulled out into the bleed margin by
// stretching the outermost row/column of pixels. Scaling the whole card up to
// fill the bleed would push edge content past the safe zone — which is exactly
// what the printer flagged.
export const EXPORT_DPI = 350;
export const EXPORT_TRIM_W = Math.round(2.5 * EXPORT_DPI); // 875
export const EXPORT_TRIM_H = Math.round(3.5 * EXPORT_DPI); // 1225
export const EXPORT_BLEED_W = Math.round(2.6 * EXPORT_DPI); // 910
export const EXPORT_BLEED_H = Math.round(3.6 * EXPORT_DPI); // 1260

// Center a trim-proportioned card image in the bleed canvas and extend its edge
// pixels into the 0.05" margin. `trim` may be any card-aspect size; it's fit
// into the 875×1225 trim area (older 750×1050 cards get upscaled to fit).
export function addPrintBleed(trim: HTMLCanvasElement): HTMLCanvasElement {
  const W = EXPORT_BLEED_W;
  const H = EXPORT_BLEED_H;
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const ctx = out.getContext("2d")!;

  const tw = trim.width;
  const th = trim.height;
  const scale = Math.min(EXPORT_TRIM_W / tw, EXPORT_TRIM_H / th);
  const dw = Math.round(tw * scale);
  const dh = Math.round(th * scale);
  const dx = Math.round((W - dw) / 2);
  const dy = Math.round((H - dh) / 2);
  const rightX = dx + dw;
  const bottomY = dy + dh;

  // Trim artwork, centered.
  ctx.drawImage(trim, dx, dy, dw, dh);
  // Edge strips stretched into the bleed margin.
  ctx.drawImage(trim, 0, 0, 1, th, 0, dy, dx, dh); // left
  ctx.drawImage(trim, tw - 1, 0, 1, th, rightX, dy, W - rightX, dh); // right
  ctx.drawImage(trim, 0, 0, tw, 1, dx, 0, dw, dy); // top
  ctx.drawImage(trim, 0, th - 1, tw, 1, dx, bottomY, dw, H - bottomY); // bottom
  // Corner pixels stretched into the corner margins.
  ctx.drawImage(trim, 0, 0, 1, 1, 0, 0, dx, dy);
  ctx.drawImage(trim, tw - 1, 0, 1, 1, rightX, 0, W - rightX, dy);
  ctx.drawImage(trim, 0, th - 1, 1, 1, 0, bottomY, dx, H - bottomY);
  ctx.drawImage(trim, tw - 1, th - 1, 1, 1, rightX, bottomY, W - rightX, H - bottomY);

  return out;
}
