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

// Rasterize a DOM layer (vector/text/gradient) to a W-wide canvas.
async function layerCanvas(el: HTMLElement): Promise<HTMLCanvasElement> {
  const rect = el.getBoundingClientRect();
  return toCanvas(el, { pixelRatio: W / (rect.width || W) });
}

export type FrontLayers = {
  bgEl: HTMLElement;
  overlayEl: HTMLElement;
  cutoutSrc: string | null;
  cutout: { tx: number; ty: number; scale: number; rotation: number };
  sigSrc: string | null;
  sig: { x: number; y: number; rotation: number; widthFrac: number };
};

export async function compositeFront(L: FrontLayers): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // 1. Background (gradient/image).
  ctx.drawImage(await layerCanvas(L.bgEl), 0, 0, W, H);

  // 2. Cutout photo — object-fit: contain, then the CSS transform about center.
  if (L.cutoutSrc) {
    const img = await loadImage(L.cutoutSrc);
    if (img.naturalWidth) {
      const r = Math.min(W / img.naturalWidth, H / img.naturalHeight);
      const dw = img.naturalWidth * r;
      const dh = img.naturalHeight * r;
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.translate(L.cutout.tx * W, L.cutout.ty * H);
      ctx.rotate((L.cutout.rotation * Math.PI) / 180);
      ctx.scale(L.cutout.scale, L.cutout.scale);
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    }
  }

  // 3. Overlays (jersey badge, team plate, player name) — on top of the photo.
  ctx.drawImage(await layerCanvas(L.overlayEl), 0, 0, W, H);

  // 4. Signature — centered at (x,y) fractions, contained in its box, rotated.
  if (L.sigSrc) {
    const img = await loadImage(L.sigSrc);
    if (img.naturalWidth) {
      const boxW = L.sig.widthFrac * W;
      const boxH = boxW * (img.naturalHeight / img.naturalWidth);
      const r = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight);
      const dw = img.naturalWidth * r;
      const dh = img.naturalHeight * r;
      ctx.save();
      ctx.translate(L.sig.x * W, L.sig.y * H);
      ctx.rotate((L.sig.rotation * Math.PI) / 180);
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    }
  }

  return pngBlobWithDpi(canvas.toDataURL("image/png"), 300);
}

export type BackLayers = {
  backEl: HTMLElement; // CardBack root (captured whole; headshot redrawn on top)
  headshotSrc: string | null;
  headshot: { posX: number; posY: number }; // object-position 0–100
};

export async function compositeBack(L: BackLayers): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // 1. Everything except the (raster) headshot — gradient + text/panel survive.
  ctx.drawImage(await layerCanvas(L.backEl), 0, 0, W, H);

  // 2. Headshot circle, upper-right (matches CardBack's CSS box).
  if (L.headshotSrc) {
    const img = await loadImage(L.headshotSrc);
    if (img.naturalWidth) {
      const size = 0.22 * W;
      const left = 0.95 * W - size; // right: 5%
      const top = 0.045 * H; // top: 4.5%
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
      // White ring border.
      ctx.beginPath();
      ctx.arc(cx, cy, rad - 0.007 * W, 0, Math.PI * 2);
      ctx.lineWidth = 0.014 * W;
      ctx.strokeStyle = "rgba(255,255,255,0.92)";
      ctx.stroke();
    }
  }

  return pngBlobWithDpi(canvas.toDataURL("image/png"), 300);
}
