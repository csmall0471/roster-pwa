"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { NBA_PLAYERS } from "@/lib/nba-players";

// 851-labs/background-remover (BRIA RMBG) — fast, transparent PNG output.
// Pinned version id from https://replicate.com/851-labs/background-remover/versions.
// Update when you want to upgrade to a newer release.
const REPLICATE_VERSION =
  "a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc";

type RemoveBgResult = { cutoutUrl?: string; storagePath?: string; error?: string };

export async function removeBackground(sourceUrl: string): Promise<RemoveBgResult> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return { error: "Background removal not configured (missing REPLICATE_API_TOKEN)." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Call Replicate synchronously (Prefer: wait, up to 60s).
  const res = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({
      version: REPLICATE_VERSION,
      input: { image: sourceUrl },
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { detail?: string; title?: string };
      detail = body.detail || body.title || "";
    } catch {
      detail = (await res.text()).slice(0, 200);
    }
    if (res.status === 402) {
      return {
        error:
          "Replicate account has no credit. Add billing at replicate.com/account/billing.",
      };
    }
    return { error: `Background removal failed (${res.status}): ${detail}` };
  }

  const json = (await res.json()) as {
    status: string;
    output?: string | string[] | null;
    error?: string | null;
  };

  if (json.status === "failed" || json.status === "canceled") {
    return { error: json.error || "Background removal failed" };
  }

  const output = json.output;
  const remoteUrl =
    typeof output === "string" ? output : Array.isArray(output) ? output[0] : null;
  if (!remoteUrl) return { error: "Background removal returned no image" };

  // Pull the PNG and re-host on our own bucket so the canvas isn't tainted at export.
  const imgRes = await fetch(remoteUrl);
  if (!imgRes.ok) return { error: "Could not fetch processed image" };
  const buf = new Uint8Array(await imgRes.arrayBuffer());

  const path = `${user.id}/cutouts/${crypto.randomUUID()}.png`;
  const { error: uploadErr } = await supabase.storage
    .from("player-photos")
    .upload(path, buf, { contentType: "image/png", upsert: false });
  if (uploadErr) return { error: uploadErr.message };

  const { data: urlData } = supabase.storage
    .from("player-photos")
    .getPublicUrl(path);

  return { cutoutUrl: urlData.publicUrl, storagePath: path };
}

// ── Scouting report (Claude vision) ─────────────────────────────

type ScoutingInput = {
  photoUrl: string;
  firstName: string;
  stats?: {
    position?: string;
    height?: string;
    favorite_team?: string;
    favorite_player?: string;
    signature_move?: string;
  };
};

export async function generateScoutingReport(
  input: ScoutingInput
): Promise<{ report?: string; error?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: "ANTHROPIC_API_KEY not configured" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const filledStats = input.stats
    ? Object.entries(input.stats)
        .filter(([, v]) => !!v && v !== "")
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")
    : "";

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 220,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: input.photoUrl } },
            {
              type: "text",
              text: `Write a fun "scouting report" for this youth basketball player named ${input.firstName}.
Two short sentences. Focus on apparent vibe and energy in the photo (smile, intensity, body language) — DO NOT describe physical features, ethnicity, or appearance. Be encouraging.
${filledStats ? `Known facts: ${filledStats}\n` : ""}
Respond with just the two sentences. No quotes, no labels, no preamble.`,
            },
          ],
        },
      ],
    });
    const text = res.content[0].type === "text" ? res.content[0].text.trim() : "";
    return { report: text };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Scouting report failed" };
  }
}

// ── Look-alike pick (vibe match via Claude vision) ──────────────
//
// This is NOT face recognition. We send the photo to Claude with a curated
// list of NBA players and ask it to pick a "vibe" match based on demeanor,
// energy, and body language — explicitly NOT facial features. Designed for
// kids, where face-match would be both creepy and inaccurate.

export async function findLookalike(
  photoUrl: string
): Promise<{ name?: string; error?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: "ANTHROPIC_API_KEY not configured" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const list = NBA_PLAYERS.map(
    (p) => `- ${p.name}: ${p.style}`
  ).join("\n");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 60,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: photoUrl } },
            {
              type: "text",
              text: `Pick the NBA player whose VIBE and ENERGY best matches this youth basketball player, based on body language, smile, and confidence in the photo. Do NOT use facial features, ethnicity, or skin tone.

Candidates:
${list}

Respond with ONLY the exact player name from the list. No reasoning, no punctuation.`,
            },
          ],
        },
      ],
    });
    const raw = res.content[0].type === "text" ? res.content[0].text.trim() : "";
    // Match against the curated list (Claude sometimes adds extra punctuation).
    const match = NBA_PLAYERS.find((p) =>
      raw.toLowerCase().includes(p.name.toLowerCase())
    );
    return { name: match?.name ?? raw };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Look-alike failed" };
  }
}
