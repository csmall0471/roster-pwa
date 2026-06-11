import type { SiblingItem } from "@/app/actions/siblings";

type RawSibling = {
  name: string;
  attributes: SiblingItem["attributes"] | null;
  player_id?: string | null;
};

// Siblings are stored once per guardian, so the same person can appear multiple
// times. Collapse by name (case-insensitive), keeping the richest attributes
// and preserving a player_id link if any row has one.
export function dedupeSiblings(rows: RawSibling[] | null | undefined): SiblingItem[] {
  const byName = new Map<string, SiblingItem>();
  for (const r of rows ?? []) {
    const key = r.name.trim().toLowerCase();
    const attrs = r.attributes ?? {};
    const cur = byName.get(key);
    if (!cur) {
      byName.set(key, { name: r.name.trim(), attributes: attrs, player_id: r.player_id ?? null });
    } else {
      if (Object.keys(attrs).length > Object.keys(cur.attributes).length) cur.attributes = attrs;
      if (!cur.player_id && r.player_id) cur.player_id = r.player_id;
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
