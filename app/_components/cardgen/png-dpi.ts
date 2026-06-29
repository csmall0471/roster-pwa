// Embed physical-size (DPI) metadata into a PNG so a saved card is a true
// 2.5 × 3.5 inch trading-card size when printed. Canvas/`toPng` PNGs carry no
// DPI (default 96), so we splice a `pHYs` chunk (right after IHDR) declaring
// pixels-per-metre. At 300 DPI a 750×1050 image is exactly 2.5"×3.5".

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const bin = atob(dataUrl.split(",")[1]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// A PNG data URL → Blob with a pHYs chunk for the given DPI.
export function pngBlobWithDpi(dataUrl: string, dpi = 300): Blob {
  const png = dataUrlToBytes(dataUrl);
  const ppu = Math.round(dpi / 0.0254); // pixels per metre

  // pHYs chunk: 4-byte length, "pHYs", 9-byte data, 4-byte CRC = 21 bytes.
  const chunk = new Uint8Array(21);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk[4] = 0x70; // p
  chunk[5] = 0x48; // H
  chunk[6] = 0x59; // Y
  chunk[7] = 0x73; // s
  dv.setUint32(8, ppu); // x
  dv.setUint32(12, ppu); // y
  chunk[16] = 1; // unit = metre
  dv.setUint32(17, crc32(chunk.subarray(4, 17))); // CRC over type+data

  // Insert after IHDR: 8-byte signature + (4 len + 4 type + 13 data + 4 crc) = 33.
  const at = 33;
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, at), 0);
  out.set(chunk, at);
  out.set(png.subarray(at), at + chunk.length);
  return new Blob([out], { type: "image/png" });
}
