import { createClient } from "@/lib/supabase/server";
import { buildRaisedFoilPdf, type FoilSpotName } from "@/lib/cardgen/foil-pdf";

// sharp + pdf-lib need the Node runtime (not edge).
export const runtime = "nodejs";

const SPOTS: FoilSpotName[] = ["RUVgold", "RUVsilver", "RUVrosegold"];

// Assemble a print-ready Raised Foil PDF from two client-rendered PNGs (the full
// card art + a white-on-black foil mask) and stream it back for download. Kept
// separate from the normal PNG export so ordinary cards are untouched.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const form = await req.formData();
  const base = form.get("base");
  const mask = form.get("mask");
  if (!(base instanceof Blob) || !(mask instanceof Blob)) {
    return new Response("Missing base/mask image", { status: 400 });
  }

  const widthIn = Number(form.get("widthIn") ?? 2.6);
  const heightIn = Number(form.get("heightIn") ?? 3.6);
  if (!Number.isFinite(widthIn) || !Number.isFinite(heightIn)) {
    return new Response("Bad page size", { status: 400 });
  }
  const spotRaw = String(form.get("spot") ?? "RUVgold");
  const spot = (SPOTS as string[]).includes(spotRaw)
    ? (spotRaw as FoilSpotName)
    : "RUVgold";
  const filename = (String(form.get("filename") ?? "card") || "card").replace(
    /[^a-z0-9._-]/gi,
    "-",
  );

  try {
    const pdf = await buildRaisedFoilPdf({
      basePng: new Uint8Array(await base.arrayBuffer()),
      maskPng: new Uint8Array(await mask.arrayBuffer()),
      widthIn,
      heightIn,
      spotName: spot,
    });
    // Copy into a standalone buffer so the response body owns its bytes.
    const body = pdf.slice();
    return new Response(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}-${spot}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[foil-pdf] build failed", e);
    return new Response(
      `Failed to build foil PDF: ${e instanceof Error ? e.message : String(e)}`,
      { status: 500 },
    );
  }
}
