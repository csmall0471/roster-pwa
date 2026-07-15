// Build a print-ready "Raised Foil" PDF: a CMYK card with an extra named spot
// separation the printer uses to lay down foil. Server-only — pulls in `sharp`
// (CMYK/raster) and `pdf-lib` (low-level PDF assembly).
//
// The printer's spec (see their Special Instructions):
//   • one channel named exactly RUVgold / RUVsilver / RUVrosegold
//   • that ink previews as 100% Cyan
//   • flattened, at the card's trim + bleed size (2.5×3.5 → 2.6×3.6 in)
//
// The two inputs are ordinary PNGs rendered on the client: `basePng` is the
// full card art; `maskPng` is white-where-foil / black-elsewhere. This module
// converts the base to DeviceCMYK, reads the mask as a single tint channel, and
// draws them as two image XObjects — the mask in a `/Separation` colorspace.
import { deflateSync } from "node:zlib";
import sharp from "sharp";
import {
  PDFDocument,
  PDFName,
  PDFArray,
  PDFRawStream,
  type PDFRef,
} from "pdf-lib";

export type FoilSpotName = "RUVgold" | "RUVsilver" | "RUVrosegold";

export async function buildRaisedFoilPdf(opts: {
  basePng: Uint8Array; // full card front (any colorspace), at bleed size
  maskPng: Uint8Array; // foil mask, white = foil, same pixel size as base
  widthIn: number; // physical page width (inches), e.g. 2.6
  heightIn: number; // physical page height (inches), e.g. 3.6
  spotName?: FoilSpotName; // channel name; must match the printer's spec exactly
}): Promise<Uint8Array> {
  const spotName = opts.spotName ?? "RUVgold";

  // Base → DeviceCMYK, 8bpc, no alpha (flatten over white if any).
  const base = await sharp(opts.basePng)
    .flatten({ background: "#ffffff" })
    .toColourspace("cmyk")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = base.info.width;
  const height = base.info.height;
  if (base.info.channels !== 4) {
    throw new Error(`base image expected 4 (CMYK) channels, got ${base.info.channels}`);
  }

  // Mask → single-channel tint (0 = no foil, 255 = full foil). Force it to the
  // base's dimensions so the two images register exactly.
  const mask = await sharp(opts.maskPng)
    .resize(width, height, { fit: "fill" })
    .flatten({ background: "#000000" })
    .toColourspace("b-w")
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (mask.info.channels !== 1) {
    throw new Error(`mask image expected 1 channel, got ${mask.info.channels}`);
  }

  const doc = await PDFDocument.create();
  const ctx = doc.context;

  // Tint transform t → CMYK (t,0,0,0): the ink previews as 100% Cyan per spec.
  const tintFn = ctx.obj({
    FunctionType: 2,
    Domain: [0, 1],
    C0: [0, 0, 0, 0],
    C1: [1, 0, 0, 0],
    N: 1,
  });
  // Colorspace: [ /Separation /<spotName> /DeviceCMYK <tintFn> ]
  const sepCS = PDFArray.withContext(ctx);
  sepCS.push(PDFName.of("Separation"));
  sepCS.push(PDFName.of(spotName));
  sepCS.push(PDFName.of("DeviceCMYK"));
  sepCS.push(tintFn);
  const sepRef = ctx.register(sepCS);

  const imageRef = (
    data: Uint8Array,
    colorSpace: PDFName | PDFRef,
  ): PDFRef => {
    const comp = deflateSync(data);
    const dict = ctx.obj({
      Type: PDFName.of("XObject"),
      Subtype: PDFName.of("Image"),
      Width: width,
      Height: height,
      ColorSpace: colorSpace,
      BitsPerComponent: 8,
      Filter: PDFName.of("FlateDecode"),
      Length: comp.length,
    });
    return ctx.register(PDFRawStream.of(dict, comp));
  };

  const baseRef = imageRef(base.data, PDFName.of("DeviceCMYK"));
  const foilRef = imageRef(mask.data, sepRef);

  // Foil ink overprints the CMYK beneath it instead of knocking it out.
  const gsRef = ctx.register(
    ctx.obj({ Type: PDFName.of("ExtGState"), OP: true, op: true, OPM: 1 }),
  );

  const pageW = opts.widthIn * 72;
  const pageH = opts.heightIn * 72;
  const content =
    `q ${pageW} 0 0 ${pageH} 0 0 cm /BaseIm Do Q\n` +
    `q /GSfoil gs ${pageW} 0 0 ${pageH} 0 0 cm /FoilIm Do Q\n`;
  const contentComp = deflateSync(Buffer.from(content, "latin1"));
  const contentRef = ctx.register(
    PDFRawStream.of(
      ctx.obj({ Filter: PDFName.of("FlateDecode"), Length: contentComp.length }),
      contentComp,
    ),
  );

  const page = doc.addPage([pageW, pageH]);
  page.node.set(PDFName.of("Contents"), contentRef);
  page.node.set(
    PDFName.of("Resources"),
    ctx.obj({
      XObject: { BaseIm: baseRef, FoilIm: foilRef },
      ExtGState: { GSfoil: gsRef },
    }),
  );

  return doc.save();
}
