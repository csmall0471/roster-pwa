import { createClient } from "@/lib/supabase/server";
import { runAnalysis } from "../../analyze";

// Server-Sent Events: streams { done, total } progress as Claude works through
// the batches, then a final `result` event with the conflicts. Lets the client
// show a real progress bar + ETA without slowing the concurrent run.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // Allowed: the coach who owns teams, or a granted roster admin (shared
  // access) — same rule as the server actions. RLS also enforces this.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { count } = await supabase
    .from("teams")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  let allowed = (count ?? 0) > 0;
  if (!allowed) {
    const { data: admin } = await supabase.rpc("is_roster_admin");
    allowed = !!admin;
  }
  if (!allowed) return new Response("Forbidden", { status: 403 });

  console.error(`[analyze route] connected — season ${id}`);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* stream already closed (client disconnected) */
        }
      };
      req.signal.addEventListener("abort", () => console.error(`[analyze route] client disconnected — aborting season ${id}`));
      try {
        const result = await runAnalysis(supabase, id, (done, total) => send("progress", { done, total }), req.signal);
        send("result", result);
      } catch (e) {
        // A client-disconnect abort is expected, not a real failure.
        if (!req.signal.aborted) {
          console.error(`[analyze route] failed:`, e instanceof Error ? e.message : e);
          send("failed", { message: e instanceof Error ? e.message : "Analysis failed." });
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
