import { PDFDocument, StandardFonts } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { getTransaction } from "@/lib/shippo";
import { canShip } from "../data";

// One PDF holding every requested label, so a batch prints in one go.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type LabelRow = {
  id: string;
  label_url: string | null;
  shippo_transaction_id: string | null;
  recipient_name: string;
};

async function fetchPdf(url: string | null): Promise<Uint8Array | null> {
  if (!url || !url.startsWith("https://")) return null;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: teamId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!canShip(user)) return new Response("Forbidden", { status: 403 });

  const ids = (new URL(req.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s))
    .slice(0, 200);
  if (!ids.length) return new Response("No labels selected", { status: 400 });

  const { data, error } = await supabase
    .from("card_shipments")
    .select("id, label_url, shippo_transaction_id, recipient_name")
    .eq("team_id", teamId)
    .eq("status", "purchased")
    .in("id", ids);
  if (error) return new Response(error.message, { status: 500 });
  const rows = ((data ?? []) as LabelRow[]).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  if (!rows.length) return new Response("No bought labels found", { status: 404 });

  const out = await PDFDocument.create();
  const missing: string[] = [];
  for (const row of rows) {
    let bytes = await fetchPdf(row.label_url);
    // Shippo's label links can expire; a fresh copy of the transaction has a new one.
    if (!bytes && row.shippo_transaction_id) {
      try {
        const tx = await getTransaction(row.shippo_transaction_id);
        bytes = await fetchPdf(tx.label_url ?? null);
        if (bytes && tx.label_url) {
          await supabase.from("card_shipments").update({ label_url: tx.label_url }).eq("id", row.id);
        }
      } catch {
        bytes = null;
      }
    }
    if (!bytes) {
      missing.push(row.recipient_name || row.id);
      continue;
    }
    try {
      const src = await PDFDocument.load(bytes);
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
    } catch {
      missing.push(row.recipient_name || row.id);
    }
  }
  if (out.getPageCount() === 0) {
    return new Response(`Couldn't download the labels for: ${missing.join(", ")}`, { status: 502 });
  }
  // A short batch must be obvious before printing, so the first page says so.
  if (missing.length) {
    const font = await out.embedFont(StandardFonts.HelveticaBold);
    const body = await out.embedFont(StandardFonts.Helvetica);
    const page = out.insertPage(0, [288, 432]);
    page.drawText(`${missing.length} label${missing.length === 1 ? "" : "s"} missing`, {
      x: 20,
      y: 392,
      size: 18,
      font,
    });
    page.drawText("Couldn't download from Shippo. Try printing these again:", { x: 20, y: 366, size: 9, font: body });
    missing.slice(0, 24).forEach((name, i) => {
      // The built-in font only covers Latin-1.
      const safe = name.slice(0, 40).replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?");
      page.drawText(`- ${safe}`, { x: 20, y: 344 - i * 13, size: 10, font: body });
    });
  }

  const pdf = await out.save();
  return new Response(pdf as BlobPart, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="shipping-labels.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
