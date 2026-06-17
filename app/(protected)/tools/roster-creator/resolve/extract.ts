import Anthropic from "@anthropic-ai/sdk";

// Claude-first intent extraction. Reads ALL of a player's free-text request
// fields at once and routes the content to structured fields — handling
// multiple coach options, data typed into the wrong column, buddies buried in
// junk, and discarding noise. Opus + thinking; cost is intentionally secondary
// to quality here.
const MODEL = "claude-opus-4-8";
// 30 players/batch keeps each request small enough to avoid output truncation
// (quality) while CONCURRENCY fans the batches out in parallel for speed. The
// SDK retries 429s with backoff (maxRetries below), so a higher concurrency
// safely absorbs rate-limit bumps; lower this if the API account is a small tier.
const BATCH_SIZE = 30;
// Fan batches out in parallel. Wall-clock is dominated by the slowest batch in
// each wave, so getting a typical season (~28 batches) into a SINGLE wave roughly
// halves the time vs the old 16 (which forced a second wave). The SDK retries
// 429s with backoff (maxRetries below), so this can't be slower than the account's
// rate limit allows — it just uses all available headroom. Lower it only if a
// small-tier account 429s so persistently that backoff thrash dominates.
const CONCURRENCY = 32;

export type RawPlayer = {
  id: string;
  coachFirst: string;
  coachLast: string;
  team: string;
  buddyFirst: string;
  buddyLast: string;
  nights: string;
  school: string;
  division: string;
  // Authoritative coach names for this player's division (admin-uploaded). When
  // present, Claude maps each requested coach to the exact matching name.
  coachCandidates?: string[];
};

export type ExtractedIntent = {
  id: string;
  coaches: string[];
  team: string;
  buddies: string[];
  playUp: boolean;
  notes: string;
};

const SYSTEM = `You normalize youth-sports signup requests. Parents typed these by hand into separate fields (coach, team, teammates/family, practice nights), but the data is messy and often in the wrong field. For EACH player, read every field and extract structured intent.

Return, per player:
- coaches: the coach name(s) requested, normalized to "First Last". If the parent gives ALTERNATIVES ("Brent or Kevin Clissold or Green", "Todd (or Kirby) Martin", "Coach Todd Martin or Coach Kirby Martin") return EACH as a separate option: ["Brent Clissold","Kevin Green"] / ["Todd Martin","Kirby Martin"]. A single co-coaching staff written together ("Tony/Jon Galietti/Valentine", "Nef & Cody Lizarraga and Lenhart", "Matthew and rj Hernandez") is ONE option, kept as written but tidied. Strip prefixes like "Coach".
- When a line includes "known coaches in division: ...", that is the authoritative roster of coaches for that player's division. Map each requested coach to the EXACT matching name from that list when you're confident — fixing nicknames, typos, and partial names (a bare surname or first name) to the full listed name. If a requested coach clearly is NOT in that list, still return it as written; the caller treats it as an unhonored request. Always return coaches as "First Last".
- team: the requested team name, normalized (fix casing/typos: "Battle cats"->"Battle Cats", "Lil' Bulldogs"->"Little Bulldogs"). "" if none.
- buddies: teammates/friends/siblings the player wants to be with, as "First Last" where possible. Parse multi-name cells, positionally-aligned first/last columns, "&"/"and"/comma lists, and names buried in prose. Drop a buddy you can't name.
- playUp: true if the request mentions playing up an age, an older sibling in a higher division, or a specific higher age bracket (e.g. "U10", "10U", "play up", "older brother in 10U").
- notes: any other genuinely meaningful instruction (scheduling preference, "do not put on X team", "practice night matters more than coach"). "" if none.

CRITICAL rules:
- DATA IS OFTEN IN THE WRONG FIELD. A coach name in the team field (e.g. team="NEF LIZARRAGA" or "Steve Schon Vipers") -> put the coach in coaches and any real team in team. A team in the coach field -> move it to team. A buddy in the coach/team field -> move it to buddies.
- DISCARD NOISE entirely (return empty, not the text): "none","None","no requests","n/a","na","unknown","unk","idk","tbd","?","JP ?","Jone","Brown" (bare partials), "Last season","Can't remember","Mine","Any","Nome","No request No request", repeated junk, and obvious placeholders.
- Repeated/duplicated text (the export sometimes doubles a value like "Tommy Davitt Tommy Davitt") should be de-duplicated.
- Never invent names. If a field is pure noise, leave that output empty.
- Keep coaches/buddies as people, team as a team name — do not mix them up.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    players: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          coaches: { type: "array", items: { type: "string" } },
          team: { type: "string" },
          buddies: { type: "array", items: { type: "string" } },
          play_up: { type: "boolean" },
          notes: { type: "string" },
        },
        required: ["id", "coaches", "team", "buddies", "play_up", "notes"],
      },
    },
  },
  required: ["players"],
} as const;

function emptyIntent(id: string): ExtractedIntent {
  return { id, coaches: [], team: "", buddies: [], playUp: false, notes: "" };
}

async function extractBatch(
  client: Anthropic,
  batch: RawPlayer[],
  signal?: AbortSignal,
  // Reports players finished WITHIN this batch as they stream in, so the overall
  // bar climbs continuously instead of jumping a whole batch at a time.
  onPlayer?: (delta: number) => void
): Promise<ExtractedIntent[]> {
  const lines = batch
    .map((p) => {
      let line = `id=${p.id} | coach: ${p.coachFirst} ${p.coachLast} | team: ${p.team} | teammates: ${p.buddyFirst} / ${p.buddyLast} | nights: ${p.nights} | school: ${p.school} | division: ${p.division}`;
      if (p.coachCandidates && p.coachCandidates.length > 0) {
        line += ` | known coaches in division: ${p.coachCandidates.join(", ")}`;
      }
      return line;
    })
    .join("\n");

  const byId = new Map(batch.map((p) => [p.id, emptyIntent(p.id)]));

  let raw = "";
  let reported = 0;
  // Make sure every player in this batch is counted once the batch is done, even
  // if the stream-based estimate undercounted (or the batch failed).
  const topUp = () => {
    if (onPlayer && reported < batch.length) {
      onPlayer(batch.length - reported);
      reported = batch.length;
    }
  };

  try {
    const stream = client.messages.stream(
      {
        model: MODEL,
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
        messages: [{ role: "user", content: `Extract intent for these players:\n\n${lines}` }],
      },
      { signal }
    );
    // Each player object ends with a "notes" field, so counting "notes": keys in
    // the streamed text is a good proxy for players completed so far.
    stream.on("text", (_delta, snapshot) => {
      const count = Math.min((snapshot.match(/"notes"\s*:/g) ?? []).length, batch.length);
      if (onPlayer && count > reported) {
        onPlayer(count - reported);
        reported = count;
      }
    });
    const final = await stream.finalMessage();
    const textBlock = final.content.find((b) => b.type === "text");
    raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
  } catch (e) {
    // Account-level errors (billing/auth) hit every batch — fail loudly instead
    // of silently returning empty results.
    if (e instanceof Anthropic.APIError) {
      const status = e.status;
      const msg = e.message ?? "";
      if (status === 400 && /credit balance|billing|too low/i.test(msg)) {
        throw new Error(
          "Anthropic API credit balance is too low. Add credits in the API Console → Plans & Billing. " +
            "(A Claude Max/Pro subscription does not include API usage — they're billed separately.)"
        );
      }
      if (status === 401 || status === 403) {
        throw new Error("Anthropic API key is invalid or lacks access — check ANTHROPIC_API_KEY.");
      }
    }
    // Otherwise one flaky batch shouldn't kill the whole run — log and continue.
    console.error(`[extract] batch failed (${batch.length} players):`, e instanceof Error ? e.message : e);
  } finally {
    topUp();
  }

  if (!raw) return [...byId.values()];
  try {
    const parsed = JSON.parse(raw) as {
      players?: { id?: string; coaches?: string[]; team?: string; buddies?: string[]; play_up?: boolean; notes?: string }[];
    };
    for (const r of parsed.players ?? []) {
      if (!r.id || !byId.has(r.id)) continue;
      byId.set(r.id, {
        id: r.id,
        coaches: (r.coaches ?? []).map((s) => s.trim()).filter(Boolean),
        team: (r.team ?? "").trim(),
        buddies: (r.buddies ?? []).map((s) => s.trim()).filter(Boolean),
        playUp: !!r.play_up,
        notes: (r.notes ?? "").trim(),
      });
    }
  } catch {
    console.error("[extract] batch returned unparseable JSON");
  }
  return [...byId.values()];
}

export async function extractIntent(
  players: RawPlayer[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal
): Promise<ExtractedIntent[]> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured.");
  if (players.length === 0) return [];

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 5 });
  const batches: RawPlayer[][] = [];
  for (let i = 0; i < players.length; i += BATCH_SIZE) batches.push(players.slice(i, i + BATCH_SIZE));
  console.error(`[extract] ${players.length} players → ${batches.length} batches, concurrency ${CONCURRENCY}`);

  const results: ExtractedIntent[][] = new Array(batches.length);
  let done = 0;
  // Incremented player-by-player as each batch streams in (across all workers).
  const bump = (delta: number) => {
    done += delta;
    onProgress?.(done, players.length);
  };
  let next = 0;
  async function worker() {
    while (next < batches.length) {
      if (signal?.aborted) throw new Error("aborted");
      const idx = next++;
      const t0 = Date.now();
      results[idx] = await extractBatch(client, batches[idx], signal, bump);
      console.error(`[extract] batch ${idx + 1}/${batches.length} done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${done}/${players.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
  console.error(`[extract] all batches complete`);
  return results.flat();
}
