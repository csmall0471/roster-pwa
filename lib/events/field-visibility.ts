// Shared visibility rule for dependent (conditional) form fields — used by the
// public signup form, the coach signup editor, and server-side pricing so all
// three agree on which answers count.
//
// A field with parent_field_id is shown only while its parent's current answer
// matches parent_value. Semantics by parent type: yesno/checkbox store booleans
// ('yes' matches true, 'no' matches false); select stores the option string.
// Chains are allowed (a dependent field can itself be a parent); a hidden
// ancestor hides the whole chain.

export type DependentFieldLike = {
  id: string;
  field_type: string;
  parent_field_id?: string | null;
  parent_value?: string | null;
};

export function fieldVisible(
  field: DependentFieldLike,
  values: Record<string, string | number | boolean | undefined | null>,
  fieldsById: Map<string, DependentFieldLike>
): boolean {
  let cur: DependentFieldLike = field;
  // Hop cap guards against a cycle ever sneaking into the data.
  for (let hops = 0; hops < 10; hops++) {
    if (!cur.parent_field_id) return true;
    const parent = fieldsById.get(cur.parent_field_id);
    if (!parent) return true; // dangling reference → fail open
    const v = values[parent.id];
    const want = cur.parent_value ?? "";
    const match =
      parent.field_type === "yesno" || parent.field_type === "checkbox"
        ? want === "no"
          ? v === false
          : v === true
        : String(v ?? "") === want;
    if (!match) return false;
    cur = parent;
  }
  return true;
}

// Drop answers that belong to fields currently hidden by their dependency, so
// a flipped-back parent ("jersey? yes → size M → jersey? no") doesn't submit
// (or price) the stale child answers.
export function stripHiddenValues<T extends string | number | boolean>(
  fields: DependentFieldLike[],
  values: Record<string, T>
): Record<string, T> {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(values)) {
    const f = byId.get(k);
    if (f && !fieldVisible(f, values, byId)) continue;
    out[k] = v;
  }
  return out;
}
