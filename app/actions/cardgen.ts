"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import type { CardSport } from "@/lib/types";

// Sport-specific phrasing for the two AI features. Keeps the scouting report and
// the "plays like" match on-sport (a football card matches NFL/college players
// and searches Wikipedia for football, not basketball).
const SPORT_AI: Record<
  CardSport,
  {
    noun: string;
    leagues: string;
    household: string;
    wikiSuffix: string;
    lenses: string[];
    // Duo-match phrasing: famous pairings to seed variety, plus "lenses" that
    // describe kinds of duos (teammate connections, brother acts, tandems).
    duoHousehold: string;
    duoLenses: string[];
  }
> = {
  basketball: {
    noun: "basketball",
    leagues: "NBA or WNBA, any era (current stars, all-time greats, international players, or beloved role players), any position",
    household: "LeBron James, Stephen Curry, Michael Jordan, Kevin Durant, Giannis Antetokounmpo, Ja Morant",
    wikiSuffix: "basketball player",
    duoHousehold:
      "the Splash Brothers (Stephen Curry & Klay Thompson), Shaq & Kobe, Stockton & Malone, LeBron & Wade, the Gasol brothers, the Morris twins, Bird & McHale",
    duoLenses: [
      "a splash-brothers shooting backcourt",
      "a dominant big-man and clutch guard tandem",
      "a pick-and-roll duo that always connects",
      "two brothers who both made the league",
      "twins who play off each other",
      "a veteran-and-young-star mentor pairing",
      "a pass-first point guard and his go-to finisher",
      "two lockdown defenders who anchor the team",
      "a high-flying alley-oop connection",
      "best friends on and off the court",
    ],
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
    duoHousehold:
      "Montana & Rice, Brady & Gronk, Mahomes & Kelce, the Manning brothers (Peyton & Eli), the Watt brothers (J.J. & T.J.), Marino & Clayton, the Bash Brothers backfield",
    duoLenses: [
      "a quarterback and his favorite deep threat",
      "a quarterback-to-tight-end connection",
      "a two-headed running back committee",
      "brothers who both went pro",
      "a shutdown cornerback tandem",
      "a pass rusher duo that lives in the backfield",
      "a center and quarterback who share every snap",
      "a wideout duo defenses can't cover",
      "a hard-hitting safety pairing",
      "best friends who came up together",
    ],
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

// ── Duo "plays like" (a famous pro PAIRING for duo/trio cards) ──────────────
//
// The duo analog of findLookalike: instead of one pro, suggest famous DUOS —
// teammates, a signature on-field connection, or brothers — that match the
// pair's shared vibe. Tailored to duos end-to-end (its own prompt + "lenses"),
// and each option carries up to two pro photos (one per member).

// Split a pair label ("Stephen Curry & Klay Thompson") into its member names.
function splitDuoNames(pair: string): string[] {
  return pair
    .split(/\s*(?:&|\band\b|\/|,|\+)\s*/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
    .slice(0, 2);
}

export type DuoLookalikeOption = {
  name: string; // "Stephen Curry & Klay Thompson"
  blurb?: string;
  photos?: string[]; // up to 2 pro photos, one per member (in order)
};

export async function findDuoLookalike(
  photoUrl: string,
  context?: {
    names?: string[]; // the kids' first names, e.g. ["CJ", "Alex"]
    sport?: CardSport;
    scoutingReport?: string;
  }
): Promise<{ options?: DuoLookalikeOption[]; error?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: "ANTHROPIC_API_KEY not configured" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const ai = SPORT_AI[context?.sport ?? "basketball"];
  const kids = (context?.names ?? []).filter(Boolean);
  const count = kids.length >= 3 ? "trio" : "duo";

  // Seed a few random duo "lenses" so repeat runs surface a different mix.
  const seeds = [...ai.duoLenses]
    .sort(() => Math.random() - 0.5)
    .slice(0, 5)
    .join("; ");
  const whoHint = kids.length
    ? ` for ${count === "trio" ? "a trio" : "a duo"} named ${kids.join(" & ")}`
    : "";
  const scout = context?.scoutingReport?.trim();
  const scoutHint = scout
    ? `The coach's note on this group: "${scout.slice(0, 400)}" — weigh that energy alongside the photo, but let the photo lead. `
    : "";

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 700,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: photoUrl } },
            {
              type: "text",
              text: `Suggest EIGHT fun "duo match" comparisons for a youth ${ai.noun} trading card${whoHint}, so the coach can pick one.

Each is a real famous ${ai.noun} PAIRING — two players who are longtime teammates, a signature on-field connection, or brothers — from ${ai.leagues}. Judge the match on the pair's shared VIBE and ENERGY from the photo (body language, smiles, confidence, how they carry themselves together) — NOT facial features, ethnicity, or skin tone.

Make the eight DIVERSE: mix teammate duos AND brother/sibling duos, different eras and positions; include some less-obvious picks, not just the household pairings (${ai.duoHousehold}). ${scoutHint}For range, draw on kinds of duos like: ${seeds}.

Respond with EXACTLY 8 lines and nothing else — no numbering, no preamble. Each line:
First Last & First Last | one short present-tense sentence (about 8-16 words) on what makes them a great duo. Use "&" between the two names. No quotation marks.`,
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
      // A valid duo line names two players (contains a separator).
      .filter((o) => o.name.length > 3 && splitDuoNames(o.name).length >= 2);

    // De-dupe by pair name, cap at 8.
    const seen = new Set<string>();
    const uniq: { name: string; blurb: string }[] = [];
    for (const o of parsed) {
      const k = o.name.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        uniq.push(o);
      }
    }
    const top = uniq.slice(0, 8);
    if (top.length === 0) return { error: "No duo matches came back — try again." };

    // Fetch each member's photo in parallel (Wikipedia; CORS-enabled).
    const options: DuoLookalikeOption[] = await Promise.all(
      top.map(async (o) => {
        const members = splitDuoNames(o.name);
        const photos = (
          await Promise.all(members.map((m) => wikipediaPhoto(m, ai.wikiSuffix)))
        ).filter((p): p is string => !!p);
        return { name: o.name, blurb: o.blurb || undefined, photos };
      })
    );
    return { options };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Duo match failed" };
  }
}
