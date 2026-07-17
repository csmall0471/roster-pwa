import { pngBlobWithDpi } from "@/app/_components/cardgen/png-dpi";

// Print target: 2.6×3.6" (2.5×3.5 card + 0.05" bleed) at 350 DPI.
const BLEED_W = 910;
const BLEED_H = 1260;
const DPI = 350;

// Fetch a stored card image and normalize it to a print-ready 910×1260 PNG
// (2.6×3.6" @ 350 DPI) with the background covering every edge (bleed).
//
// Cards saved after the bleed change are already 910×1260, so the cover-scale
// is a 1:1 no-op. Cards saved earlier are 750×1050 (2.5×3.5, no bleed); scaling
// them up to fill the bleed frame gives the printer the bleed + dimensions it
// requires (slightly softer than re-saving, but well within print tolerance).
// Falls back to the untouched file if the image can't be processed.
export async function fetchCardForPrint(url: string, name: string): Promise<File> {
  const pngName = name.replace(/\.(jpe?g|png)$/i, "") + ".png";
  const res = await fetch(url);
  const blob = await res.blob();
  try {
    const bitmap = await createImageBitmap(blob);
    // Only reshape things that are already ~2.5×3.5 cards (0.714) or the new
    // bleed size (0.722). Leave other uploads — landscape/square season photos —
    // untouched so we don't crop them to card shape.
    const aspect = bitmap.width / bitmap.height;
    if (aspect < 0.69 || aspect > 0.74) {
      bitmap.close?.();
      return new File([blob], name, { type: blob.type || "image/png" });
    }
    const canvas = document.createElement("canvas");
    canvas.width = BLEED_W;
    canvas.height = BLEED_H;
    const ctx = canvas.getContext("2d")!;
    const s = Math.max(BLEED_W / bitmap.width, BLEED_H / bitmap.height); // cover
    const dw = bitmap.width * s;
    const dh = bitmap.height * s;
    ctx.drawImage(bitmap, (BLEED_W - dw) / 2, (BLEED_H - dh) / 2, dw, dh);
    bitmap.close?.();
    const out = pngBlobWithDpi(canvas.toDataURL("image/png"), DPI);
    return new File([out], pngName, { type: "image/png" });
  } catch {
    return new File([blob], name, { type: blob.type || "image/png" });
  }
}
