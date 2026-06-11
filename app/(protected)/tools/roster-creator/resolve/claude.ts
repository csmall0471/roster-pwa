import Anthropic from "@anthropic-ai/sdk";

// Model for the resolution pass. Opus is the most capable for the messy,
// contextual name-matching here; switch to "claude-haiku-4-5" to trade some
// accuracy for lower cost/latency (matches the app's other AI features).
const MODEL = "claude-opus-4-8";

export type EntityValue = { value: string; count: number };
export type EntityGroup = { canonical: string; variants: string[] };

const ENTITY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    groups: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          canonical: { type: "string" },
          variants: { type: "array", items: { type: "string" } },
        },
        required: ["canonical", "variants"],
      },
    },
  },
  required: ["groups"],
} as const;

const ENTITY_SYSTEM: Record<"coach" | "team", string> = {
  coach: `You canonicalize youth-sports COACH-request entries typed by parents.
Group together the spellings that refer to the same coach (or coaching staff), and keep genuinely different people apart.
- Merge misspellings and nicknames: "Troy Merkel" = "Troy Merkle"; "Nef Lizarraga" = "Neftali Lizarraga"; "Brent Cissold" = "Brent Clissold".
- Do NOT merge different people who merely share a first name: "Cody Ahern" is NOT "Cody Lenhart".
- An entry naming two coaches (e.g. "Tony/Jon Galietti/Valentine", "Nef & Cody") is a single co-coaching staff — keep it as ONE group; do not split it.
- Choose the cleanest, most common spelling as the canonical name.`,
  team: `You canonicalize youth-sports TEAM-NAME-request entries typed by parents.
Group together the spellings that refer to the same team, and keep different teams apart.
- Merge casing/spelling/punctuation variants: "Battle cats" = "Battle Cats"; "Little bulldogs" = "Lil' Bulldogs" = "Little Bulldogs".
- Keep distinct team names separate even under the same coach: "Battle Cats" and "Battle Kittens" are DIFFERENT teams.
- If an entry is clearly NOT a team name (a coach's personal name, "Unknown", "not sure", "tbd"), put it in its own single-member group so it can be discarded by a human.
- Choose the cleanest, most common spelling as the canonical name.`,
};

// Canonicalize a set of free-text coach or team values into groups. Every input
// value is covered: any value Claude omits is returned as its own singleton.
export async function canonicalizeEntities(
  kind: "coach" | "team",
  values: EntityValue[]
): Promise<EntityGroup[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }
  if (values.length === 0) return [];

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const listText = values.map((v) => `${v.value} (×${v.count})`).join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [{ type: "text", text: ENTITY_SYSTEM[kind], cache_control: { type: "ephemeral" } }],
    output_config: { format: { type: "json_schema", schema: ENTITY_SCHEMA } },
    messages: [
      {
        role: "user",
        content: `Group these ${kind} entries. Use ONLY these exact strings as variants; cover every one of them:\n\n${listText}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
  if (!raw) return values.map((v) => ({ canonical: v.value, variants: [v.value] }));

  let parsed: { groups?: { canonical?: string; variants?: string[] }[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return values.map((v) => ({ canonical: v.value, variants: [v.value] }));
  }

  const inputSet = new Set(values.map((v) => v.value));
  const covered = new Set<string>();
  const groups: EntityGroup[] = [];
  for (const g of parsed.groups ?? []) {
    const variants = (g.variants ?? []).filter((v) => inputSet.has(v) && !covered.has(v));
    if (variants.length === 0) continue;
    variants.forEach((v) => covered.add(v));
    groups.push({ canonical: g.canonical || variants[0], variants });
  }
  // Any value Claude dropped or never mentioned → keep as its own group.
  for (const v of values) {
    if (!covered.has(v.value)) groups.push({ canonical: v.value, variants: [v.value] });
  }
  return groups;
}

export type BuddyRequest = { id: string; name: string; rawText: string };
export type RosterEntry = { id: string; name: string };
export type ClaudeBuddyMatch = { requesterId: string; buddyIds: string[] };

const SYSTEM = `You match youth-sports "buddy / teammate" requests to players on a roster.
The request text is typed by parents and is messy: misspellings, nicknames (e.g. "Nef" = "Neftali", "Lexi" = "Alexxa"), several names crammed into one field, names split across fields oddly, or junk like "see last names below".

For each request you are given the requesting player and their raw request text. Return the roster ids of the player(s) they most likely meant.

Rules:
- Only return ids that appear in the provided roster. NEVER invent an id.
- A request may name zero, one, or several teammates — return every id that clearly matches.
- Never match a requester to themselves.
- Prefer precision over recall: if you cannot confidently identify a teammate, leave it out rather than guessing.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          requester_id: { type: "string" },
          buddy_ids: { type: "array", items: { type: "string" } },
        },
        required: ["requester_id", "buddy_ids"],
      },
    },
  },
  required: ["matches"],
} as const;

// Resolve the buddy requests fuzzy matching couldn't, against the roster.
export async function matchBuddiesWithClaude(
  requests: BuddyRequest[],
  roster: RosterEntry[]
): Promise<ClaudeBuddyMatch[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }
  if (requests.length === 0) return [];

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const rosterText = roster.map((r) => `${r.id}\t${r.name}`).join("\n");
  const requestText = requests
    .map((r) => `${r.id}\t${r.name}\twants: ${r.rawText}`)
    .join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    // Stable instructions cached across batches; volatile data in the user turn.
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [
      {
        role: "user",
        content: `ROSTER (id<TAB>name):\n${rosterText}\n\nREQUESTS (requester_id<TAB>requester_name<TAB>raw text):\n${requestText}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
  if (!raw) return [];

  let parsed: { matches?: { requester_id?: string; buddy_ids?: string[] }[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const rosterIds = new Set(roster.map((r) => r.id));
  return (parsed.matches ?? [])
    .filter((m): m is { requester_id: string; buddy_ids: string[] } =>
      Boolean(m.requester_id && Array.isArray(m.buddy_ids))
    )
    .map((m) => ({
      requesterId: m.requester_id,
      // Drop hallucinated ids and self-matches defensively.
      buddyIds: m.buddy_ids.filter((id) => rosterIds.has(id) && id !== m.requester_id),
    }))
    .filter((m) => m.buddyIds.length > 0);
}
