import { toCanvas } from "html-to-image";
import { pngBlobWithDpi } from "./png-dpi";

// iOS Safari drops raster images (both <img> and CSS background images) inside
// the SVG <foreignObject> that html-to-image renders through — only gradients
// and text survive. So we composite the card on a real canvas: vector layers
// (gradient background, text/plates) are captured with html-to-image, and the
// raster layers (photo, signature, headshot) are drawn with drawImage, which
// iOS handles reliably. Output is a true 2.5"×3.5" card: 750×1050 @ 300 DPI.

const W = 750;
const H = 1050;

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  // Avoid tainting the canvas if src is a remote (Supabase) URL — drawing a
  // tainted image makes toDataURL throw. Storage serves CORS; data URLs ignore it.
  img.crossOrigin = "anonymous";
  img.src = src;
  try {
    await img.decode();
  } catch {
    /* fall through — drawImage will no-op if it never loaded */
  }
  return img;
}

// Rasterize a DOM layer (vector/text/gradient) to an outW-wide canvas.
async function layerCanvas(
  el: HTMLElement,
  outW: number
): Promise<HTMLCanvasElement> {
  const rect = el.getBoundingClientRect();
  return toCanvas(el, { pixelRatio: outW / (rect.width || outW) });
}

export type FrontLayers = {
  bgEl: HTMLElement;
  overlayEl: HTMLElement;
  cutoutSrc: string | null;
  cutout: { tx: number; ty: number; scale: number; rotation: number };
  sigSrc: string | null;
  sig: { x: number; y: number; rotation: number; widthFrac: number };
};

// Composite the front onto a canvas at an arbitrary output width (height keeps
// the 5:7 ratio). Shared by the full-size export (outW = 750) and the smaller
// tiles in the "all backgrounds" contact sheet. All positions are fractional so
// the same math scales to any size.
export async function compositeFrontCanvas(
  L: FrontLayers,
  outW: number = W
): Promise<HTMLCanvasElement> {
  const outH = Math.round(outW * (H / W));
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d")!;

  // 1. Background (gradient/image).
  ctx.drawImage(await layerCanvas(L.bgEl, outW), 0, 0, outW, outH);

  // 2. Cutout photo — object-fit: contain, then the CSS transform about center.
  if (L.cutoutSrc) {
    const img = await loadImage(L.cutoutSrc);
    if (img.naturalWidth) {
      const r = Math.min(outW / img.naturalWidth, outH / img.naturalHeight);
      const dw = img.naturalWidth * r;
      const dh = img.naturalHeight * r;
      ctx.save();
      ctx.translate(outW / 2, outH / 2);
      ctx.translate(L.cutout.tx * outW, L.cutout.ty * outH);
      ctx.rotate((L.cutout.rotation * Math.PI) / 180);
      ctx.scale(L.cutout.scale, L.cutout.scale);
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    }
  }

  // 3. Overlays (jersey badge, team plate, player name) — on top of the photo.
  ctx.drawImage(await layerCanvas(L.overlayEl, outW), 0, 0, outW, outH);

  // 4. Signature — centered at (x,y) fractions, contained in its box, rotated.
  if (L.sigSrc) {
    const img = await loadImage(L.sigSrc);
    if (img.naturalWidth) {
      const boxW = L.sig.widthFrac * outW;
      const boxH = boxW * (img.naturalHeight / img.naturalWidth);
      const r = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight);
      const dw = img.naturalWidth * r;
      const dh = img.naturalHeight * r;
      ctx.save();
      ctx.translate(L.sig.x * outW, L.sig.y * outH);
      ctx.rotate((L.sig.rotation * Math.PI) / 180);
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    }
  }

  return canvas;
}

export async function compositeFront(L: FrontLayers): Promise<Blob> {
  const canvas = await compositeFrontCanvas(L, W);
  return pngBlobWithDpi(canvas.toDataURL("image/png"), 300);
}

// ── Raised Foil export (separate from the normal PNG path) ─────────────────

// OR a captured layer's alpha silhouette onto the (white-on-black) mask: every
// pixel the source actually paints becomes solid foil ink. A 0.5 alpha cut-off
// keeps hard letterform/plate edges and drops soft drop-shadows.
function stampSilhouette(
  mctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  outW: number,
  outH: number
) {
  const off = document.createElement("canvas");
  off.width = outW;
  off.height = outH;
  off.getContext("2d")!.drawImage(src, 0, 0, outW, outH);
  const paint = off.getContext("2d")!.getImageData(0, 0, outW, outH).data;
  const cur = mctx.getImageData(0, 0, outW, outH);
  const d = cur.data;
  for (let i = 0; i < paint.length; i += 4) {
    if (paint[i + 3] > 128) {
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = 255;
    }
  }
  mctx.putImageData(cur, 0, 0);
}

export type FoilMaskInput = {
  overlayEl: HTMLElement; // the front overlay layer (name/plate/jersey/stamp)
  selected: Set<string>; // which data-foil keys (+ "signature") are foiled
  sigSrc?: string | null;
  sig?: { x: number; y: number; rotation: number; widthFrac: number };
};

// Build the foil mask: white where the toggled elements paint, black elsewhere.
// The overlay foil elements are captured in one pass, filtered by data-foil so
// only the selected ones survive; the signature (its own raster) is stamped
// with the same transform the front compositor uses, to stay in register.
export async function compositeFoilMaskCanvas(
  M: FoilMaskInput,
  outW: number = W
): Promise<HTMLCanvasElement> {
  const outH = Math.round(outW * (H / W));
  const mask = document.createElement("canvas");
  mask.width = outW;
  mask.height = outH;
  const mctx = mask.getContext("2d")!;
  mctx.fillStyle = "#000";
  mctx.fillRect(0, 0, outW, outH);

  if ([...M.selected].some((k) => k !== "signature")) {
    const rect = M.overlayEl.getBoundingClientRect();
    const cap = await toCanvas(M.overlayEl, {
      pixelRatio: outW / (rect.width || outW),
      filter: (node) => {
        const foil = (node as HTMLElement).dataset?.foil;
        return !foil || M.selected.has(foil);
      },
    });
    stampSilhouette(mctx, cap, outW, outH);
  }

  if (M.selected.has("signature") && M.sigSrc && M.sig) {
    const img = await loadImage(M.sigSrc);
    if (img.naturalWidth) {
      const tmp = document.createElement("canvas");
      tmp.width = outW;
      tmp.height = outH;
      const tctx = tmp.getContext("2d")!;
      const boxW = M.sig.widthFrac * outW;
      const boxH = boxW * (img.naturalHeight / img.naturalWidth);
      const r = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight);
      const dw = img.naturalWidth * r;
      const dh = img.naturalHeight * r;
      tctx.save();
      tctx.translate(M.sig.x * outW, M.sig.y * outH);
      tctx.rotate((M.sig.rotation * Math.PI) / 180);
      tctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      tctx.restore();
      stampSilhouette(mctx, tmp, outW, outH);
    }
  }

  return mask;
}

// Scale a trim-size (2.5×3.5) canvas to cover a bleed-size target, centered, so
// the full-bleed art extends past the trim on all sides. `bg` fills the margin
// before drawing — white for the base, black (no ink) for the mask.
export function coverIntoCanvas(
  src: HTMLCanvasElement,
  targetW: number,
  targetH: number,
  bg: string
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = targetW;
  out.height = targetH;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, targetW, targetH);
  const s = Math.max(targetW / src.width, targetH / src.height);
  const dw = src.width * s;
  const dh = src.height * s;
  ctx.drawImage(src, (targetW - dw) / 2, (targetH - dh) / 2, dw, dh);
  return out;
}

export type BackLayers = {
  backEl: HTMLElement; // CardBack root (captured whole; raster layers redrawn on top)
  headshotSrc: string | null;
  headshot: { posX: number; posY: number }; // object-position 0–100
  lookalikeSrc: string | null; // matched pro player photo
};

// Draw a cover-fit image clipped to a circle into the given box.
async function drawCircle(
  ctx: CanvasRenderingContext2D,
  src: string,
  x: number,
  y: number,
  w: number,
  h: number,
  ring: { width: number; color: string },
  // Vertical anchor (0 = top, 0.5 = center): which point of the image sits at
  // the circle's center. Lower biases toward the face on a portrait. Clamped so
  // the image still fully covers the circle.
  anchorY = 0.5
) {
  const img = await loadImage(src);
  if (!img.naturalWidth) return;
  const r = Math.max(w / img.naturalWidth, h / img.naturalHeight); // cover
  const dw = img.naturalWidth * r;
  const dh = img.naturalHeight * r;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rad = Math.min(w, h) / 2;
  const minA = rad / dh;
  const a = Math.max(minA, Math.min(1 - minA, anchorY));
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, cx - dw / 2, cy - a * dh, dw, dh);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, rad - ring.width / 2, 0, Math.PI * 2);
  ctx.lineWidth = ring.width;
  ctx.strokeStyle = ring.color;
  ctx.stroke();
}

export async function compositeBack(L: BackLayers): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // 1. Everything except the (raster) headshot — gradient + text/panel survive.
  ctx.drawImage(await layerCanvas(L.backEl, W), 0, 0, W, H);

  // 2. Headshot circle, upper-right (matches CardBack's CSS box) with its pan.
  if (L.headshotSrc) {
    const img = await loadImage(L.headshotSrc);
    if (img.naturalWidth) {
      const size = 0.22 * W;
      const left = 0.905 * W - size; // right: 9.5% (matches CardBack's inset)
      const top = 0.035 * H; // top: 3.5%
      const r = Math.max(size / img.naturalWidth, size / img.naturalHeight); // cover
      const dw = img.naturalWidth * r;
      const dh = img.naturalHeight * r;
      const ox = (size - dw) * (L.headshot.posX / 100);
      const oy = (size - dh) * (L.headshot.posY / 100);
      const cx = left + size / 2;
      const cy = top + size / 2;
      const rad = size / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, left + ox, top + oy, dw, dh);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(cx, cy, rad - 0.007 * W, 0, Math.PI * 2);
      ctx.lineWidth = 0.014 * W;
      ctx.strokeStyle = "rgba(255,255,255,0.92)";
      ctx.stroke();
    }
  }

  // 3. "Plays like" pro-player photo — position read from its live box (it sits
  // in a flex row whose spot depends on the content above it).
  if (L.lookalikeSrc) {
    const el = L.backEl.querySelector<HTMLElement>("[data-lookalike-photo]");
    if (el) {
      const br = L.backEl.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      const s = W / (br.width || W);
      await drawCircle(
        ctx,
        L.lookalikeSrc,
        (er.left - br.left) * s,
        (er.top - br.top) * s,
        er.width * s,
        er.height * s,
        { width: 0.006 * W, color: "rgba(10,10,10,0.55)" },
        0.3 // bias toward the face
      );
    }
  }

  return pngBlobWithDpi(canvas.toDataURL("image/png"), 300);
}
