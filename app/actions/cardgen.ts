"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import type { CardSport } from "@/lib/types";

// Sport-specific phrasing for the two AI features. Keeps the scouting report and
// the "plays like" match on-sport (a football card matches NFL/college players
// and searches Wikipedia for football, not basketball).
const SPORT_AI: Record<
  CardSport,
  { noun: string; leagues: string; household: string; wikiSuffix: string; lenses: string[] }
> = {
  basketball: {
    noun: "basketball",
    leagues: "NBA or WNBA, any era (current stars, all-time greats, international players, or beloved role players), any position",
    household: "LeBron James, Stephen Curry, Michael Jordan, Kevin Durant, Giannis Antetokounmpo, Ja Morant",
    wikiSuffix: "basketball player",
    lenses: [
      "a lightning-quick guard",
      "a crafty playmaker",
      "a lockdown defender",
      "a smooth mid-range scorer",
      "a high-energy hustle player",
      "a knockdown sharpshooter",
      "a fearless slasher who attacks the rim",
      "a poised floor general",
      "an old-school throwback",
      "a modern positionless star",
      "a WNBA standout",
      "a beloved cult-favorite role player",
      "a relentless rebounder",
      "a flashy showman",
    ],
  },
  football: {
    noun: "football",
    leagues: "the NFL or major college football, any era (current stars, all-time greats, or beloved role players), any position",
    household: "Patrick Mahomes, Tom Brady, Travis Kelce, Tyreek Hill, Aaron Donald, Lamar Jackson",
    wikiSuffix: "football player",
    lenses: [
      "a mobile dual-threat quarterback",
      "a bruising downhill running back",
      "a shifty change-of-pace back",
      "a sure-handed possession receiver",
      "a burner deep threat",
      "a physical run-blocking tight end",
      "a shutdown cornerback",
      "a ball-hawking safety",
      "a sideline-to-sideline linebacker",
      "a road-grading offensive lineman",
      "a disruptive edge rusher",
      "a clutch kicker",
      "a special-teams gunner",
      "an all-purpose athlete",
    ],
  },
};

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
  sport?: CardSport;
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
              text: `Write a fun "scouting report" for this youth ${SPORT_AI[input.sport ?? "basketball"].noun} player named ${input.firstName}.
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
// This is NOT face recognition. We send the photo to Claude and ask it to pick
// "vibe" matches from that sport's pros based on demeanor, energy, and body
// language — explicitly NOT facial features. Designed for kids, where a
// face-match would be both creepy and inaccurate.

// Look up a player's photo from Wikipedia (free, broad coverage, CORS-enabled so
// the card canvas can draw it). Searches "<name> <sport> player" to dodge
// disambiguation, and returns the page's lead thumbnail.
async function wikipediaPhoto(name: string, suffix: string): Promise<string | null> {
  try {
    const url =
      "https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages" +
      "&piprop=thumbnail&pithumbsize=400&generator=search&gsrlimit=1&gsrsearch=" +
      encodeURIComponent(`${name} ${suffix}`);
    const res = await fetch(url, {
      headers: { "User-Agent": "roster-pwa/1.0 (card plays-like)" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      query?: { pages?: Record<string, { thumbnail?: { source?: string } }> };
    };
    const pages = json.query?.pages;
    if (!pages) return null;
    return Object.values(pages)[0]?.thumbnail?.source ?? null;
  } catch {
    return null;
  }
}

export type LookalikeOption = {
  name: string;
  blurb?: string;
  photoUrl?: string | null;
};

export async function findLookalike(
  photoUrl: string,
  context?: {
    firstName?: string;
    sport?: CardSport;
    position?: string;
    height?: string;
    favoritePlayer?: string;
    scoutingReport?: string;
  }
): Promise<{ options?: LookalikeOption[]; error?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: "ANTHROPIC_API_KEY not configured" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const ai = SPORT_AI[context?.sport ?? "basketball"];

  // Seed a few random "lenses" so repeat runs surface a different mix rather
  // than the same ten household names.
  const seeds = [...ai.lenses]
    .sort(() => Math.random() - 0.5)
    .slice(0, 6)
    .join("; ");
  const roleHint = context?.position
    ? `They play ${context.position}${
        context.height ? `, listed around ${context.height}` : ""
      } — favor pros who play a similar role, not just the most famous names. `
    : "";
  const fav = context?.favoritePlayer?.trim();
  const favHint = fav
    ? `The kid's favorite player is ${fav} — ALWAYS include ${fav} as one of the ten, with its own play-style line. `
    : "";
  const scout = context?.scoutingReport?.trim();
  const scoutHint = scout
    ? `The coach's scouting note on this player: "${scout.slice(0, 400)}" — weigh that style/energy alongside the photo, but let the photo lead. `
    : "";

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const res = await client.messages.create({
      // Opus reads vibe/energy from a photo far better than Haiku, which kept
      // defaulting to the same few household names. (Sampling params like
      // temperature aren't accepted on this model — diversity comes from the
      // prompt + the random seeds above.)
      model: "claude-opus-4-8",
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: photoUrl } },
            {
              type: "text",
              text: `Suggest TEN fun "plays like" comparisons for a youth ${ai.noun} trading card${
                context?.firstName ? ` for a player named ${context.firstName}` : ""
              }, so the coach can choose one.

Each is a real professional ${ai.noun} player — ${ai.leagues} — whose VIBE and ENERGY match this kid, judged only from body language, posture, smile, and confidence in the photo. Match on personality and energy — NOT facial features, ethnicity, or skin tone.

Make the ten DIVERSE: mix positions, eras, and leagues; include some less-obvious picks, not just the handful of household names (${ai.household}). ${favHint}${roleHint}${scoutHint}For range, draw on styles like: ${seeds}.

Respond with EXACTLY 10 lines and nothing else — no numbering, no preamble. Each line:
Full Name | one short present-tense sentence (about 8-14 words) on how that player plays. No quotation marks.`,
            },
          ],
        },
      ],
    });
    const raw = res.content[0]?.type === "text" ? res.content[0].text.trim() : "";
    const parsed = raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const idx = line.indexOf("|");
        // Strip any leading "1." / "1)" numbering and wrapping quotes; keep
        // internal apostrophes & hyphens (De'Aaron Fox, Karl-Anthony Towns).
        const name = (idx >= 0 ? line.slice(0, idx) : line)
          .replace(/^\s*\d+[.)]\s*/, "")
          .replace(/^["'\s]+|["'.\s]+$/g, "")
          .trim();
        const blurb =
          idx >= 0
            ? line.slice(idx + 1).replace(/^["'\s]+|["'\s]+$/g, "").trim()
            : "";
        return { name, blurb };
      })
      .filter((o) => o.name.length > 1);

    // De-dupe by name, cap at 10.
    const seen = new Set<string>();
    const uniq: { name: string; blurb: string }[] = [];
    for (const o of parsed) {
      const k = o.name.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        uniq.push(o);
      }
    }
    const top = uniq.slice(0, 10);

    // Guarantee the kid's favorite player is in the list, up front — whether or
    // not the model remembered to include it.
    if (fav) {
      const at = top.findIndex((o) => o.name.toLowerCase() === fav.toLowerCase());
      if (at >= 0) {
        top.unshift(top.splice(at, 1)[0]);
      } else {
        top.unshift({ name: fav, blurb: "" });
        if (top.length > 10) top.pop();
      }
    }

    if (top.length === 0) return { error: "No matches came back — try again." };

    // Fetch each player's photo in parallel (Wikipedia; CORS-enabled).
    const options: LookalikeOption[] = await Promise.all(
      top.map(async (o) => ({
        name: o.name,
        blurb: o.blurb || undefined,
        photoUrl: await wikipediaPhoto(o.name, ai.wikiSuffix),
      }))
    );
    return { options };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Look-alike failed" };
  }
}
