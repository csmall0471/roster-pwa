// iPhone photos arrive with EXIF "rotate 90°" tags that downstream image
// processors (like the bg-removal models) ignore — so the cutout comes back
// sideways. Decode through createImageBitmap with from-image, downscale, and
// re-encode as JPEG so the bytes themselves are upright.
export async function normalizePhotoForUpload(
  file: Blob,
  maxDim = 1600,
  quality = 0.92
): Promise<Blob> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Canvas not supported in this browser");
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) =>
        b
          ? resolve(b)
          : reject(new Error("Could not encode photo — try JPEG or PNG")),
      "image/jpeg",
      quality
    );
  });
}
