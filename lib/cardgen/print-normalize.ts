import { pngBlobWithDpi } from "@/app/_components/cardgen/png-dpi";
import {
  addPrintBleed,
  EXPORT_BLEED_W,
  EXPORT_BLEED_H,
  EXPORT_DPI,
} from "@/lib/cardgen/print-bleed";

// Fetch a stored card image and, if needed, make it print-ready: a 910×1260 PNG
// (2.6×3.6" @ 350 DPI) with the background extended to every edge (bleed).
//
// - Cards saved after the bleed change are already 910×1260 → returned as-is.
// - Older 750×1050 cards (2.5×3.5, no bleed) are centered and edge-extended so
//   content keeps its safe margin while the background fills the bleed.
// - Anything that isn't card-shaped (landscape/square season photos) is left
//   untouched so it isn't cropped to card shape.
// Falls back to the untouched file if the image can't be processed.
export async function fetchCardForPrint(url: string, name: string): Promise<File> {
  const pngName = name.replace(/\.(jpe?g|png)$/i, "") + ".png";
  const res = await fetch(url);
  const blob = await res.blob();
  const asIs = () => new File([blob], name, { type: blob.type || "image/png" });
  try {
    const bitmap = await createImageBitmap(blob);
    const w = bitmap.width;
    const h = bitmap.height;
    // Already print-ready, or not a card — leave it alone.
    const alreadyBled = Math.abs(w - EXPORT_BLEED_W) <= 2 && Math.abs(h - EXPORT_BLEED_H) <= 2;
    const aspect = w / h;
    if (alreadyBled || aspect < 0.69 || aspect > 0.74) {
      bitmap.close?.();
      return asIs();
    }
    const trim = document.createElement("canvas");
    trim.width = w;
    trim.height = h;
    trim.getContext("2d")!.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const out = pngBlobWithDpi(addPrintBleed(trim).toDataURL("image/png"), EXPORT_DPI);
    return new File([out], pngName, { type: "image/png" });
  } catch {
    return asIs();
  }
}
