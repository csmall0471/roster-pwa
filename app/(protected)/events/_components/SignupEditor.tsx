"use client";

import { useMemo, useState } from "react";
import { saveSignupAsCoach, type CoachAttendeeInput } from "../actions";
import { PLAYER_ATTRIBUTE_CATALOG } from "@/lib/types";
import type {
  EventField,
  EventFieldType,
  EventPriceTierWithFields,
  EventSignup,
  SavedSibling,
  SignupPlayer,
} from "@/lib/types";

// A roster parent the coach can link a signup to (and seed the whole family
// from — mirrors what identifyParent returns for the parent-facing form).
export type RosterParentOption = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  players: SignupPlayer[];
  siblings: SavedSibling[];
  familyParents: { name: string }[];
};

type FieldVal = string | number | boolean;
type EditorField = { id: string; label: string; field_type: EventFieldType; options: string[]; required: boolean };
type Row = { key: string; tierId: string; name: string; attrs: Record<string, FieldVal>; status: "attending" | "declined" };

let seq = 0;
const nextKey = () => `r${seq++}`;
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const inputCls =
  "w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none";

// A tier's per-attendee fields: standard attributes (grade/shirt/birthdate,
// keyed by LABEL) then the coach's custom tier fields (keyed by id). This must
// match the public form so stored data round-trips and prices the same way.
function attendeeFieldsFor(t: EventPriceTierWithFields): EditorField[] {
  const custom: EditorField[] = [...(t.event_tier_fields ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((f) => ({ id: f.id, label: f.label, field_type: f.field_type, options: f.options ?? [], required: f.required }));
  const common: EditorField[] = (t.player_attributes ?? [])
    .map((k) => PLAYER_ATTRIBUTE_CATALOG.find((c) => c.key === k))
    .filter((c): c is (typeof PLAYER_ATTRIBUTE_CATALOG)[number] => Boolean(c))
    .map((c) => ({ id: c.label, label: c.label, field_type: c.field_type, options: c.options ?? [], required: false }));
  return [...common, ...custom];
}

// Map a roster kid's stored attributes onto a tier's selected player-attribute
// fields, keyed by their LABEL — matching how attendeeFieldsFor keys the common
// attributes and how the parent-facing form prefills them.
function kidAttrsForTier(t: EventPriceTierWithFields, kid: SignupPlayer): Record<string, FieldVal> {
  const out: Record<string, FieldVal> = {};
  for (const key of t.player_attributes ?? []) {
    const c = PLAYER_ATTRIBUTE_CATALOG.find((x) => x.key === key);
    if (!c) continue;
    const v = key === "grade" ? kid.grade : key === "shirt_size" ? kid.shirt_size : kid.date_of_birth;
    if (v) out[c.label] = v;
  }
  return out;
}

// Client-side price preview (server recomputes authoritatively on save).
function unitPrice(t: EventPriceTierWithFields, attrs: Record<string, FieldVal>): number {
  let adjust = 0;
  for (const f of t.event_tier_fields ?? []) {
    if ((f.field_type === "yesno" || f.field_type === "checkbox") && attrs[f.id] === true) {
      adjust += f.price_adjust_cents ?? 0;
    } else if (f.field_type === "select" && (f.option_prices?.length ?? 0) > 0) {
      const i = (f.options ?? []).indexOf(attrs[f.id] as string);
      if (i >= 0) adjust += f.option_prices[i] ?? 0;
    }
  }
  return Math.max(0, t.amount_cents + adjust);
}

function initialRows(
  signup: EventSignup | null,
  sorted: EventPriceTierWithFields[],
  fieldsByTier: Map<string, EditorField[]>
): Row[] {
  if (!signup) return [];
  const rows: Row[] = [];
  for (const t of sorted) {
    const labelToId = new Map((fieldsByTier.get(t.id) ?? []).map((f) => [f.label, f.id]));
    for (const a of (signup.attendees ?? []).filter((x) => x.tier_id === t.id)) {
      const attrs: Record<string, FieldVal> = {};
      for (const [labelKey, v] of Object.entries(a.attributes ?? {})) {
        attrs[labelToId.get(labelKey) ?? labelKey] = v;
      }
      rows.push({
        key: nextKey(),
        tierId: t.id,
        name: a.name ?? "",
        attrs,
        status: a.status === "declined" ? "declined" : "attending",
      });
    }
  }
  return rows;
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: EditorField;
  value: FieldVal | undefined;
  onChange: (v: FieldVal) => void;
}) {
  if (field.field_type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    );
  }
  if (field.field_type === "yesno") {
    return (
      <div className="flex gap-1">
        {([["Yes", true], ["No", false]] as const).map(([lbl, val]) => (
          <button
            key={lbl}
            type="button"
            onClick={() => onChange(val)}
            className={`rounded px-2 py-1 text-xs font-medium ${
              value === val
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>
    );
  }
  if (field.field_type === "select") {
    return (
      <select className={inputCls} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {field.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (field.field_type === "textarea") {
    return <textarea className={inputCls} rows={2} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
  }
  const type = field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : "text";
  return (
    <input
      type={type}
      className={inputCls}
      value={String(value ?? "")}
      onChange={(e) =>
        onChange(field.field_type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)
      }
    />
  );
}

export default function SignupEditor({
  eventId,
  tiers,
  fields,
  rosterParents,
  signup,
  onClose,
  onSaved,
}: {
  eventId: string;
  tiers: EventPriceTierWithFields[];
  fields: EventField[];
  rosterParents: RosterParentOption[];
  signup: EventSignup | null;
  onClose: () => void;
  onSaved: (s: EventSignup) => void;
}) {
  const sorted = useMemo(() => [...tiers].sort((a, b) => a.position - b.position), [tiers]);
  const fieldsByTier = useMemo(
    () => new Map(sorted.map((t) => [t.id, attendeeFieldsFor(t)])),
    [sorted]
  );

  const [name, setName] = useState(signup?.name ?? "");
  const [email, setEmail] = useState(signup?.email ?? "");
  const [phone, setPhone] = useState(signup?.phone ?? "");
  const [parentId, setParentId] = useState<string | null>(signup?.parent_id ?? null);
  const [responses, setResponses] = useState<Record<string, FieldVal>>(signup?.responses ?? {});
  const [decline, setDecline] = useState<boolean>(
    Boolean(signup?.declined) && (signup?.attendees?.length ?? 0) === 0
  );
  const [rows, setRows] = useState<Row[]>(() => initialRows(signup, sorted, fieldsByTier));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rowsFor = (tierId: string) => rows.filter((r) => r.tierId === tierId);
  const patchRow = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const setAttr = (key: string, fieldId: string, v: FieldVal) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, attrs: { ...r.attrs, [fieldId]: v } } : r)));
  const addRow = (tierId: string) =>
    setRows((rs) => [...rs, { key: nextKey(), tierId, name: "", attrs: {}, status: "attending" }]);
  const removeRow = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));
  const setCount = (tierId: string, n: number) =>
    setRows((rs) => {
      const others = rs.filter((r) => r.tierId !== tierId);
      const mine = rs.filter((r) => r.tierId === tierId);
      const next = [...mine];
      while (next.length < n) next.push({ key: nextKey(), tierId, name: "", attrs: {}, status: "attending" });
      next.length = Math.max(0, n);
      return [...others, ...next];
    });

  // Link to (or seed from) a roster parent. Fills contact from that parent; when
  // creating a fresh, still-empty signup, seeds the whole family the way the
  // parent's own form would — Players (with their roster attributes), Siblings,
  // and Parents — so the coach doesn't have to retype everyone.
  function pickParent(id: string) {
    const p = rosterParents.find((x) => x.id === id);
    setParentId(id ? id : null);
    if (!p) return;
    setName(p.name);
    setEmail(p.email ?? "");
    setPhone(p.phone ?? "");
    // Only auto-seed a brand-new, untouched signup so we never clobber edits.
    if (signup || rows.length > 0) return;

    const seeded: Row[] = [];
    const playerTier = sorted.find((t) => t.is_player);
    if (playerTier && p.players.length) {
      for (const kid of p.players) {
        seeded.push({
          key: nextKey(),
          tierId: playerTier.id,
          name: playerTier.collect_attendees ? kid.name : "",
          attrs: playerTier.collect_attendees ? kidAttrsForTier(playerTier, kid) : {},
          status: "attending",
        });
      }
    }
    const siblingTier = sorted.find((t) => t.is_sibling);
    if (siblingTier?.collect_attendees && p.siblings.length) {
      const labelToId = new Map((fieldsByTier.get(siblingTier.id) ?? []).map((f) => [f.label, f.id]));
      for (const s of p.siblings) {
        const attrs: Record<string, FieldVal> = {};
        for (const [labelKey, v] of Object.entries(s.attributes ?? {})) {
          const fid = labelToId.get(labelKey);
          if (fid !== undefined) attrs[fid] = v;
        }
        seeded.push({ key: nextKey(), tierId: siblingTier.id, name: s.name, attrs, status: "attending" });
      }
    }
    const parentTier = sorted.find((t) => t.is_parent);
    const fam = p.familyParents.length ? p.familyParents : [{ name: p.name }];
    if (parentTier?.collect_attendees) {
      for (const par of fam)
        seeded.push({ key: nextKey(), tierId: parentTier.id, name: par.name, attrs: {}, status: "attending" });
    }
    if (seeded.length) setRows(seeded);
  }

  const total = decline
    ? 0
    : rows
        .filter((r) => r.status !== "declined")
        .reduce((s, r) => {
          const t = sorted.find((x) => x.id === r.tierId);
          return t ? s + unitPrice(t, r.attrs) : s;
        }, 0);

  async function save() {
    setSaving(true);
    setError(null);
    const attendees: CoachAttendeeInput[] = decline
      ? []
      : rows.map((r) => {
          const t = sorted.find((x) => x.id === r.tierId);
          const collect = t?.collect_attendees ?? true;
          return {
            tier_id: r.tierId,
            name: collect ? r.name.trim() || null : null,
            attributes: collect ? r.attrs : {},
            status: r.status,
          };
        });
    const res = await saveSignupAsCoach({
      signup_id: signup?.id ?? null,
      event_id: eventId,
      parent_id: parentId,
      name,
      email,
      phone,
      responses,
      attendees,
      decline,
    });
    if ("error" in res) {
      setError(res.error);
      setSaving(false);
      return;
    }
    onSaved(res.signup);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4">
      <div className="my-8 w-full max-w-lg rounded-2xl bg-white shadow-xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-gray-800">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">
            {signup ? "Edit signup" : "Add a signup"}
          </h3>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          {/* Link to a roster parent (also seeds contact + kids). */}
          {rosterParents.length > 0 && (
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {signup?.parent_id ? "Linked to" : "For (link to an invited player)"}
              </span>
              <select
                className={`${inputCls} mt-1`}
                value={parentId ?? ""}
                onChange={(e) => pickParent(e.target.value)}
              >
                <option value="">Guest (no linked player)</option>
                {rosterParents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.players.length ? ` — ${p.players.map((k) => k.name).join(", ")}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Contact */}
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block sm:col-span-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Name</span>
              <input className={`${inputCls} mt-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Parent / guest name" />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Email</span>
              <input className={`${inputCls} mt-1`} value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Phone</span>
              <input className={`${inputCls} mt-1`} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
          </div>

          {/* Decline toggle */}
          <label className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/50">
            <input type="checkbox" checked={decline} onChange={(e) => setDecline(e.target.checked)} />
            <span className="text-gray-700 dark:text-gray-300">Mark as not coming (decline)</span>
          </label>

          {!decline && (
            <>
              {/* Tiers */}
              {sorted.map((t) => {
                const aFields = fieldsByTier.get(t.id) ?? [];
                const tierRows = rowsFor(t.id);
                return (
                  <div key={t.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {t.label}
                        <span className="ml-2 text-xs font-normal text-gray-400">{money(t.amount_cents)} each</span>
                      </span>
                      {!t.collect_attendees && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setCount(t.id, tierRows.length - 1)}
                            className="h-6 w-6 rounded bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                          >
                            −
                          </button>
                          <span className="w-6 text-center text-sm">{tierRows.length}</span>
                          <button
                            type="button"
                            onClick={() => setCount(t.id, tierRows.length + 1)}
                            className="h-6 w-6 rounded bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>

                    {t.collect_attendees && (
                      <div className="space-y-2">
                        {tierRows.map((r) => (
                          <div key={r.key} className="rounded-md bg-gray-50 p-2 dark:bg-gray-800/50">
                            <div className="flex items-center gap-2">
                              <input
                                className={inputCls}
                                value={r.name}
                                onChange={(e) => patchRow(r.key, { name: e.target.value })}
                                placeholder="Name"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  patchRow(r.key, { status: r.status === "declined" ? "attending" : "declined" })
                                }
                                className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${
                                  r.status === "declined"
                                    ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                                    : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                                }`}
                              >
                                {r.status === "declined" ? "Not coming" : "Coming"}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeRow(r.key)}
                                className="shrink-0 text-gray-400 hover:text-red-500"
                                aria-label="Remove"
                              >
                                ✕
                              </button>
                            </div>
                            {aFields.length > 0 && (
                              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                {aFields.map((f) => (
                                  <label key={f.id} className="block">
                                    <span className="text-[11px] text-gray-500 dark:text-gray-400">{f.label}</span>
                                    <div className="mt-0.5">
                                      <FieldInput field={f} value={r.attrs[f.id]} onChange={(v) => setAttr(r.key, f.id, v)} />
                                    </div>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addRow(t.id)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800"
                        >
                          + Add {t.label.toLowerCase()}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Event custom questions */}
              {fields.length > 0 && (
                <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Questions</p>
                  <div className="space-y-2">
                    {[...fields]
                      .sort((a, b) => a.position - b.position)
                      .map((f) => (
                        <label key={f.id} className="block">
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            {f.label}
                            {f.required && <span className="text-red-500"> *</span>}
                          </span>
                          <div className="mt-0.5">
                            <FieldInput
                              field={{ id: f.id, label: f.label, field_type: f.field_type, options: f.options ?? [], required: f.required }}
                              value={responses[f.id]}
                              onChange={(v) => setResponses((r) => ({ ...r, [f.id]: v }))}
                            />
                          </div>
                        </label>
                      ))}
                  </div>
                </div>
              )}
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-5 py-3 dark:border-gray-800">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {decline ? "Declined" : `Total: ${money(total)}`}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-300"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || !name.trim()}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : signup ? "Save changes" : "Add signup"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
