// Shared signature renderer. A signature is kept as vector strokes (points
// normalized so x=1 equals the signature's reference width) so its color and
// thickness can be changed after drawing without redrawing — we just re-render
// the transparent PNG from the strokes. Both the SignaturePad ("done") and the
// editor's restyle controls call renderSignaturePng, so they stay identical.

export type SigPoint = { x: number; y: number };
export type SigStroke = SigPoint[];

// Fixed render width in px; height grows to fit the strokes. Output is cropped
// to the drawn bounding box, so the on-card size is driven by placement, not this.
const RENDER_W = 900;

// DEFAULT_THICKNESS ≈ the pad's live 3px line on a ~380px pad (3/380 ≈ 7/900).
export const DEFAULT_SIG_THICKNESS = 7;

function cropToBbox(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.toDataURL("image/png");
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width,
    minY = height,
    maxX = 0,
    maxY = 0,
    found = false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!found) return canvas.toDataURL("image/png");
  const pad = 6;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d")!.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
  return out.toDataURL("image/png");
}

// Render normalized strokes to a cropped transparent PNG data URL.
export function renderSignaturePng(
  strokes: SigStroke[],
  color: string,
  thickness: number
): string {
  let maxY = 0;
  for (const s of strokes) for (const p of s) if (p.y > maxY) maxY = p.y;
  const canvas = document.createElement("canvas");
  canvas.width = RENDER_W;
  canvas.height = Math.max(1, Math.ceil(maxY * RENDER_W) + Math.ceil(thickness) + 4);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = thickness;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const s of strokes) {
    if (s.length === 0) continue;
    const P = s.map((p) => ({ x: p.x * RENDER_W, y: p.y * RENDER_W }));
    if (P.length === 1) {
      // A tap = a dot.
      ctx.beginPath();
      ctx.arc(P[0].x, P[0].y, thickness / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    // Smooth through the midpoints of successive points (control = the point).
    ctx.beginPath();
    ctx.moveTo(P[0].x, P[0].y);
    for (let i = 1; i < P.length - 1; i++) {
      const mx = (P[i].x + P[i + 1].x) / 2;
      const my = (P[i].y + P[i + 1].y) / 2;
      ctx.quadraticCurveTo(P[i].x, P[i].y, mx, my);
    }
    ctx.lineTo(P[P.length - 1].x, P[P.length - 1].y);
    ctx.stroke();
  }

  return cropToBbox(canvas);
}
