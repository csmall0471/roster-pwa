"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  saveEvent,
  extractEventDraft,
  type EventPayload,
  type EventFieldInput,
  type EventTierFieldInput,
} from "../actions";
import {
  PLAYER_ATTRIBUTE_CATALOG,
  type EventFieldType,
  type EventWithDetails,
} from "@/lib/types";
import MarkdownEditor from "@/app/_components/MarkdownEditor";

type TeamOption = {
  id: string;
  name: string;
  season?: string | null;
  age_group?: string | null;
  season_start?: string | null;
};

// "Fall 2026 · 10U" — season + year (from season_start, unless already in the
// season text) + age group, to tell same-named teams apart in the invite list.
function teamMeta(t: TeamOption): string {
  const year = t.season_start ? t.season_start.slice(0, 4) : "";
  const season = t.season ?? "";
  const showYear = year && !season.includes(year);
  return [season, showYear ? year : "", t.age_group].filter(Boolean).join(" · ");
}

// parentKey references the parent QUESTION's row key (dependent fields: shown
// on the form only when the parent's answer matches parent_value).
type FieldRow = EventFieldInput & { key: string; parentKey: string | null };
type TierFieldRow = EventTierFieldInput & { key: string; parentKey: string | null };

// Field types whose answer can gate a dependent question.
const PARENT_TYPES: EventFieldType[] = ["yesno", "checkbox", "select"];

type DepRow = { key: string; label: string; field_type: EventFieldType; options: string[]; parentKey: string | null };

// Walks parentKey chains so the picker never offers a field that (transitively)
// depends on this one — that would be a cycle.
function dependsOn(candidate: DepRow, target: string, rows: DepRow[]): boolean {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  let cur: DepRow | undefined = candidate;
  for (let hops = 0; cur && hops < 10; hops++) {
    if (cur.parentKey === target) return true;
    cur = cur.parentKey ? byKey.get(cur.parentKey) : undefined;
  }
  return false;
}

// "Show only when [question] is [answer]" — shared by event fields and tier
// attendee fields.
function DependsOnPicker({
  rows,
  row,
  parentValue,
  onChange,
}: {
  rows: DepRow[];
  row: DepRow;
  parentValue: string;
  onChange: (patch: { parentKey: string | null; parent_value: string }) => void;
}) {
  const eligible = rows.filter(
    (r) =>
      r.key !== row.key &&
      PARENT_TYPES.includes(r.field_type) &&
      !dependsOn(r, row.key, rows)
  );
  if (eligible.length === 0 && !row.parentKey) return null;
  const parent = rows.find((r) => r.key === row.parentKey) ?? null;
  const valueChoices: string[] =
    parent?.field_type === "select" ? parent.options.filter((o) => o.trim()) : ["yes", "no"];
  return (
    <div className="flex flex-wrap items-center gap-1.5 pl-1 text-xs text-gray-600 dark:text-gray-400">
      <span>Show only when</span>
      <select
        className={inputBase + " max-w-44 py-1 text-xs"}
        value={row.parentKey ?? ""}
        onChange={(e) => {
          const pk = e.target.value || null;
          const p = rows.find((r) => r.key === pk);
          onChange({
            parentKey: pk,
            parent_value: !p ? "" : p.field_type === "select" ? p.options.find((o) => o.trim()) ?? "" : "yes",
          });
        }}
      >
        <option value="">— always shown —</option>
        {eligible.map((r, i) => (
          <option key={r.key} value={r.key}>
            {r.label.trim() || `Question ${i + 1}`}
          </option>
        ))}
      </select>
      {parent && (
        <>
          <span>is</span>
          <select
            className={inputBase + " max-w-36 py-1 text-xs"}
            value={parentValue}
            onChange={(e) => onChange({ parentKey: row.parentKey, parent_value: e.target.value })}
          >
            {valueChoices.map((v) => (
              <option key={v} value={v}>
                {parent.field_type === "select" ? v : v === "yes" ? (parent.field_type === "checkbox" ? "Checked" : "Yes") : parent.field_type === "checkbox" ? "Unchecked" : "No"}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
type TierRow = {
  key: string;
  id?: string;
  label: string;
  dollars: string;
  is_player: boolean;
  collect_attendees: boolean;
  player_attributes: string[];
  is_sibling: boolean;
  is_parent: boolean;
  fields: TierFieldRow[];
};

const FIELD_TYPES: { value: EventFieldType; label: string }[] = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Paragraph" },
  { value: "number", label: "Number" },
  { value: "select", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
  { value: "yesno", label: "Yes / No" },
];

const inputBase =
  "rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none";
const input = inputBase + " w-full";
const label = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

let keySeq = 0;
const newKey = () => `k${keySeq++}`;

// parentKey → positional parent_index for the save payload. Drops the
// dependency when the parent row is gone or its type can no longer gate.
function depPayload(
  f: { parentKey: string | null; parent_value?: string | null },
  list: { key: string; field_type: EventFieldType }[]
): { parent_index: number | null; parent_value: string | null } {
  const idx = f.parentKey ? list.findIndex((x) => x.key === f.parentKey) : -1;
  const ok = idx >= 0 && PARENT_TYPES.includes(list[idx].field_type);
  return {
    parent_index: ok ? idx : null,
    parent_value: ok ? f.parent_value ?? "" : null,
  };
}

// timestamptz <-> <input type="datetime-local"> (which uses local wall time)
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string | null {
  return v ? new Date(v).toISOString() : null;
}

export default function EventBuilder({
  teams,
  event,
  teamIds: initialTeamIds,
}: {
  teams: TeamOption[];
  event?: EventWithDetails;
  teamIds?: string[]; // the event's full team set (for editing); falls back to team_id
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [imgUploading, setImgUploading] = useState(false);

  // Pre-fill the pay link with the coach's Venmo on a NEW event so it doesn't
  // have to be typed each time. Existing events keep whatever was saved.
  const DEFAULT_PAY_URL = "https://venmo.com/u/Connor-Small-1";

  // Multi-team invite list. Initialize from the event's full set, else its
  // single primary team. The first selected team is treated as primary.
  const [teamIds, setTeamIds] = useState<string[]>(
    initialTeamIds && initialTeamIds.length ? initialTeamIds : event?.team_id ? [event.team_id] : []
  );
  const [teamFilter, setTeamFilter] = useState("");
  const toggleTeam = (id: string) =>
    setTeamIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [startsAt, setStartsAt] = useState(toLocalInput(event?.starts_at ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(event?.ends_at ?? null));
  const [deadline, setDeadline] = useState(toLocalInput(event?.signup_deadline ?? null));
  const [payUrl, setPayUrl] = useState(event ? event.pay_url ?? "" : DEFAULT_PAY_URL);
  const [payInstructions, setPayInstructions] = useState(event?.pay_instructions ?? "");

  // AI pre-fill: paste raw text → Claude fills the form fields below.
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiFilled, setAiFilled] = useState(false);

  async function runAiPrefill() {
    if (aiText.trim().length < 20) {
      setAiError("Paste a bit more text to work from.");
      return;
    }
    setAiBusy(true);
    setAiError(null);
    setAiFilled(false);
    try {
      const res = await extractEventDraft(aiText);
      if ("error" in res) {
        setAiError(res.error);
        return;
      }
      const d = res.draft;
      // Only overwrite a field when Claude actually found something for it.
      if (d.title) setTitle(d.title);
      if (d.description) setDescription(d.description);
      if (d.location) setLocation(d.location);
      if (d.starts_at) setStartsAt(d.starts_at);
      if (d.ends_at) setEndsAt(d.ends_at);
      if (d.signup_deadline) setDeadline(d.signup_deadline);
      setAiFilled(true);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setAiBusy(false);
    }
  }
  const [imageUrls, setImageUrls] = useState<string[]>(event?.image_urls ?? []);

  const [fields, setFields] = useState<FieldRow[]>(() => {
    const src = event?.event_fields ?? [];
    const keyByDbId = new Map(src.map((f) => [f.id, newKey()]));
    return src.map((f) => ({
      key: keyByDbId.get(f.id)!,
      id: f.id,
      label: f.label,
      field_type: f.field_type,
      options: f.options ?? [],
      required: f.required,
      parentKey: f.parent_field_id ? keyByDbId.get(f.parent_field_id) ?? null : null,
      parent_value: f.parent_value ?? "",
    }));
  });
  const [tiers, setTiers] = useState<TierRow[]>(() => {
    const existing: TierRow[] = (event?.event_price_tiers ?? []).map((t) => ({
      key: newKey(),
      id: t.id,
      label: t.label,
      dollars: (t.amount_cents / 100).toFixed(2),
      is_player: t.is_player,
      collect_attendees: t.collect_attendees,
      player_attributes: t.player_attributes ?? [],
      is_sibling: t.is_sibling,
      is_parent: t.is_parent ?? false,
      fields: (() => {
        const src = [...(t.event_tier_fields ?? [])].sort((a, b) => a.position - b.position);
        const keyByDbId = new Map(src.map((f) => [f.id, newKey()]));
        return src.map((f) => ({
          key: keyByDbId.get(f.id)!,
          id: f.id,
          label: f.label,
          field_type: f.field_type,
          options: f.options ?? [],
          required: f.required,
          price_adjust_cents: f.price_adjust_cents ?? 0,
          option_prices: (f.options ?? []).map((_, i) => f.option_prices?.[i] ?? 0),
          parentKey: f.parent_field_id ? keyByDbId.get(f.parent_field_id) ?? null : null,
          parent_value: f.parent_value ?? "",
        }));
      })(),
    }));
    // Every event always has a Player tier (kids map to it). Seed one for new
    // events or legacy events that predate the flag.
    if (!existing.some((t) => t.is_player)) {
      existing.unshift({
        key: newKey(),
        id: undefined,
        label: "Player",
        dollars: "",
        is_player: true,
        collect_attendees: true,
        player_attributes: [],
        is_sibling: false,
        is_parent: false,
        fields: [],
      });
    }
    return existing;
  });

  async function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setImgUploading(true);
    const supabase = createClient();
    const uploaded: string[] = [];
    for (const file of files) {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `events/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("event-images").upload(path, file);
      if (!upErr) {
        const { data } = supabase.storage.from("event-images").getPublicUrl(path);
        uploaded.push(data.publicUrl);
      }
    }
    setImageUrls((prev) => [...prev, ...uploaded]);
    setImgUploading(false);
    e.target.value = "";
  }

  // Field helpers
  const addField = () =>
    setFields((f) => [
      ...f,
      { key: newKey(), label: "", field_type: "text", options: [], required: false, parentKey: null, parent_value: "" },
    ]);
  const updateField = (key: string, patch: Partial<FieldRow>) =>
    setFields((f) => f.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const removeField = (key: string) =>
    setFields((f) =>
      f
        .filter((x) => x.key !== key)
        .map((x) => (x.parentKey === key ? { ...x, parentKey: null, parent_value: "" } : x))
    );
  const moveField = (key: string, dir: -1 | 1) =>
    setFields((f) => {
      const i = f.findIndex((x) => x.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= f.length) return f;
      const copy = [...f];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  // Tier helpers
  const addTier = () =>
    setTiers((t) => [
      ...t,
      {
        key: newKey(),
        label: "",
        dollars: "",
        is_player: false,
        collect_attendees: false,
        player_attributes: [],
        is_sibling: false,
        is_parent: false,
        fields: [],
      },
    ]);
  const updateTier = (key: string, patch: Partial<TierRow>) =>
    setTiers((t) => t.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const removeTier = (key: string) => setTiers((t) => t.filter((x) => x.key !== key));

  // Tier attendee-field helpers
  const addTierField = (tierKey: string) =>
    setTiers((t) =>
      t.map((x) =>
        x.key === tierKey
          ? {
              ...x,
              fields: [
                ...x.fields,
                { key: newKey(), label: "", field_type: "text", options: [], required: false, price_adjust_cents: 0, option_prices: [], parentKey: null, parent_value: "" },
              ],
            }
          : x
      )
    );
  const updateTierField = (tierKey: string, fieldKey: string, patch: Partial<TierFieldRow>) =>
    setTiers((t) =>
      t.map((x) =>
        x.key === tierKey
          ? { ...x, fields: x.fields.map((f) => (f.key === fieldKey ? { ...f, ...patch } : f)) }
          : x
      )
    );
  const removeTierFieldImpl = (fields: TierFieldRow[], fieldKey: string) =>
    fields
      .filter((f) => f.key !== fieldKey)
      .map((f) => (f.parentKey === fieldKey ? { ...f, parentKey: null, parent_value: "" } : f));
  const removeTierField = (tierKey: string, fieldKey: string) =>
    setTiers((t) =>
      t.map((x) =>
        x.key === tierKey ? { ...x, fields: removeTierFieldImpl(x.fields, fieldKey) } : x
      )
    );
  const togglePlayerAttr = (tierKey: string, attrKey: string) =>
    setTiers((t) =>
      t.map((x) =>
        x.key === tierKey
          ? {
              ...x,
              player_attributes: x.player_attributes.includes(attrKey)
                ? x.player_attributes.filter((a) => a !== attrKey)
                : [...x.player_attributes, attrKey],
            }
          : x
      )
    );
  // Only one tier can be the sibling tier; flagging it implies collecting names
  // and clears the parent flag on the same tier (a tier is one special kind).
  const setSiblingTier = (tierKey: string, on: boolean) =>
    setTiers((t) =>
      t.map((x) =>
        x.key === tierKey
          ? { ...x, is_sibling: on, is_parent: on ? false : x.is_parent, collect_attendees: on ? true : x.collect_attendees }
          : { ...x, is_sibling: on ? false : x.is_sibling }
      )
    );
  // Same for the parent tier.
  const setParentTier = (tierKey: string, on: boolean) =>
    setTiers((t) =>
      t.map((x) =>
        x.key === tierKey
          ? { ...x, is_parent: on, is_sibling: on ? false : x.is_sibling, collect_attendees: on ? true : x.collect_attendees }
          : { ...x, is_parent: on ? false : x.is_parent }
      )
    );

  function handleSave() {
    setError(null);
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    const payload: EventPayload = {
      id: event?.id,
      team_ids: teamIds,
      title,
      description,
      location,
      starts_at: fromLocalInput(startsAt),
      ends_at: fromLocalInput(endsAt),
      signup_deadline: fromLocalInput(deadline),
      pay_url: payUrl,
      pay_instructions: payInstructions,
      image_urls: imageUrls,
      fields: fields.map((f) => ({
        id: f.id,
        label: f.label,
        field_type: f.field_type,
        options: f.field_type === "select" ? f.options.filter((o) => o.trim()) : [],
        required: f.required,
        ...depPayload(f, fields),
      })),
      tiers: tiers.map((t) => ({
        id: t.id,
        label: t.label,
        amount_cents: Math.round(parseFloat(t.dollars || "0") * 100) || 0,
        is_player: t.is_player,
        collect_attendees: t.collect_attendees,
        player_attributes: t.player_attributes,
        is_sibling: t.is_sibling,
        is_parent: t.is_parent,
        fields: t.fields.map((f) => {
          // Drop blank option rows, keeping each option's price aligned.
          const pairs =
            f.field_type === "select"
              ? f.options
                  .map((o, i) => ({ o: o.trim(), p: Math.round(f.option_prices[i] ?? 0) }))
                  .filter((x) => x.o)
              : [];
          return {
            id: f.id,
            label: f.label,
            field_type: f.field_type,
            options: pairs.map((x) => x.o),
            required: f.required,
            price_adjust_cents: f.price_adjust_cents ?? 0,
            option_prices: pairs.map((x) => x.p),
            ...depPayload(f, t.fields),
          };
        }),
      })),
    };
    start(async () => {
      const res = await saveEvent(payload);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.push(`/events/${res.id}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8 pb-16">
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-4 py-2.5 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* AI pre-fill */}
      <section className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-blue-800 dark:text-blue-300">✨ Pre-fill from text</h2>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
            Paste an event email or flyer and Claude fills in the title, a parent-friendly description, location,
            and dates below. It keeps only what attendees need and drops fundraising/marketing fluff. Review before saving.
          </p>
        </div>
        <textarea
          className={input}
          rows={4}
          value={aiText}
          onChange={(e) => { setAiText(e.target.value); setAiFilled(false); }}
          placeholder="Paste the event email/flyer text here…"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={runAiPrefill}
            disabled={aiBusy || aiText.trim().length < 20}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {aiBusy && <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />}
            {aiBusy ? "Reading…" : "Pre-fill the form"}
          </button>
          {aiError && <span className="text-sm text-red-600 dark:text-red-400">{aiError}</span>}
          {aiFilled && !aiError && <span className="text-sm text-green-700 dark:text-green-400">Filled in below — review &amp; edit.</span>}
        </div>
      </section>

      {/* Details */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Event details</h2>
        <div>
          <label className={label}>Title *</label>
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="End of Season Party" />
        </div>
        <div>
          <label className={label}>Description</label>
          <MarkdownEditor
            value={description}
            onChange={setDescription}
            rows={5}
            placeholder="What's happening, what to bring, etc."
          />
        </div>
        <div>
          <label className={label}>Location</label>
          <input className={input} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Main Street Park, 123 Main St" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>Starts</label>
            <input type="datetime-local" className={input} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div>
            <label className={label}>Ends</label>
            <input type="datetime-local" className={input} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>Signup deadline</label>
            <input type="datetime-local" className={input} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <div>
            <label className={label}>Teams to invite</label>
            {teams.length > 8 && (
              <input
                className={`${input} mb-2`}
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                placeholder="Filter teams…"
              />
            )}
            <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-300 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
              {teams
                .filter((t) => `${t.name} ${teamMeta(t)}`.toLowerCase().includes(teamFilter.trim().toLowerCase()))
                .map((t) => {
                  const meta = teamMeta(t);
                  return (
                    <label key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                      <input type="checkbox" className="h-4 w-4 shrink-0" checked={teamIds.includes(t.id)} onChange={() => toggleTeam(t.id)} />
                      <span className="min-w-0">
                        <span className="text-gray-800 dark:text-gray-200">{t.name}</span>
                        {meta && <span className="text-gray-400 dark:text-gray-500"> · {meta}</span>}
                      </span>
                      {teamIds[0] === t.id && teamIds.length > 1 && (
                        <span className="ml-auto shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">primary</span>
                      )}
                    </label>
                  );
                })}
              {teams.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">No teams yet.</p>}
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Players from every selected team appear in the invite picker. {teamIds.length > 1 ? "The first (primary) team brands the emails." : "Pick one or more."}
            </p>
          </div>
        </div>

        {/* Images */}
        <div>
          <label className={label}>Photos</label>
          {imageUrls.length > 0 && (
            <div className="flex flex-wrap gap-3 mb-3">
              {imageUrls.map((url) => (
                <div key={url} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-24 w-24 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
                  <button
                    type="button"
                    onClick={() => setImageUrls((p) => p.filter((u) => u !== url))}
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-600 text-white text-xs leading-none"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <input type="file" accept="image/*" multiple onChange={handleImage} disabled={imgUploading} className="text-sm text-gray-600 dark:text-gray-400" />
          {imgUploading && <p className="text-xs text-gray-500 mt-1">Uploading…</p>}
        </div>
      </section>

      {/* Price tiers */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Price tiers</h2>
          <button type="button" onClick={addTier} className="text-sm font-medium text-blue-600 hover:text-blue-800">
            + Add tier
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          People pick how many of each on signup (e.g. Player $12, Sibling $15, Parent $30). The
          Player tier is always included — a signed-in parent&apos;s kids count toward it. Set $0 for free.
        </p>
        {tiers.map((t) => (
          <div
            key={t.key}
            className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 space-y-2"
          >
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <input
                  className={inputBase + " w-full" + (t.is_player ? " pr-20" : "")}
                  placeholder="Tier name (e.g. Sibling)"
                  value={t.label}
                  onChange={(e) => updateTier(t.key, { label: e.target.value })}
                />
                {t.is_player && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    Players
                  </span>
                )}
              </div>
              <div className="relative w-28 shrink-0">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input
                  className={inputBase + " w-full pl-6"}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={t.dollars}
                  onChange={(e) => updateTier(t.key, { dollars: e.target.value })}
                />
              </div>
              {t.is_player ? (
                <span className="w-5 shrink-0" />
              ) : (
                <button
                  type="button"
                  onClick={() => removeTier(t.key)}
                  className="w-5 shrink-0 px-1 text-gray-400 hover:text-red-600"
                >
                  ✕
                </button>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={t.collect_attendees}
                onChange={(e) => updateTier(t.key, { collect_attendees: e.target.checked })}
              />
              Collect each attendee&apos;s name{t.is_player ? " (kids are pre-filled)" : ""}
            </label>

            {!t.is_player && (
              <>
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={t.is_sibling}
                    onChange={(e) => setSiblingTier(t.key, e.target.checked)}
                  />
                  This is the Sibling tier — remember &amp; pre-fill the family&apos;s siblings next time
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={t.is_parent}
                    onChange={(e) => setParentTier(t.key, e.target.checked)}
                  />
                  This is the Parent tier — pre-fill the signed-in parent&apos;s name
                </label>
              </>
            )}

            {t.collect_attendees && (
              <div className="ml-6 space-y-2 border-l border-gray-200 dark:border-gray-800 pl-3">
                <div className="space-y-1">
                  <p className="text-xs text-gray-400">
                    {t.is_player
                      ? "Pre-fill these roster fields per kid (parents can edit if wrong):"
                      : t.is_sibling
                        ? "Collect these per sibling — saved & pre-filled next time:"
                        : t.is_parent
                          ? "Collect these per parent:"
                          : "Collect these standard fields per attendee:"}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {PLAYER_ATTRIBUTE_CATALOG.map((attr) => (
                      <label
                        key={attr.key}
                        className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400"
                      >
                        <input
                          type="checkbox"
                          checked={t.player_attributes.includes(attr.key)}
                          onChange={() => togglePlayerAttr(t.key, attr.key)}
                        />
                        {attr.label}
                      </label>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  Name is always asked. Add extra details to collect per attendee (e.g. shirt size, age).
                </p>
                {t.fields.map((tf) => (
                  <div key={tf.key} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <input
                        className={inputBase + " flex-1 min-w-0"}
                        placeholder="Detail label (e.g. Shirt size)"
                        value={tf.label}
                        onChange={(e) => updateTierField(t.key, tf.key, { label: e.target.value })}
                      />
                      <select
                        className={inputBase + " w-32 shrink-0"}
                        value={tf.field_type}
                        onChange={(e) =>
                          updateTierField(t.key, tf.key, {
                            field_type: e.target.value as EventFieldType,
                          })
                        }
                      >
                        {FIELD_TYPES.map((ft) => (
                          <option key={ft.value} value={ft.value}>
                            {ft.label}
                          </option>
                        ))}
                      </select>
                      <label
                        className="flex shrink-0 cursor-pointer items-center gap-1 text-xs text-gray-600 dark:text-gray-400"
                        title="Parents must answer this for each attendee (only while the question is shown)"
                      >
                        <input
                          type="checkbox"
                          checked={tf.required}
                          onChange={(e) => updateTierField(t.key, tf.key, { required: e.target.checked })}
                        />
                        Req.
                      </label>
                      <button
                        type="button"
                        onClick={() => removeTierField(t.key, tf.key)}
                        className="shrink-0 px-1 text-gray-400 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </div>
                    {tf.field_type === "select" && (
                      <div className="space-y-1.5 pl-1">
                        {tf.options.map((opt, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input
                              className={inputBase + " flex-1 min-w-0"}
                              placeholder={`Choice ${i + 1} (e.g. Standard)`}
                              value={opt}
                              onChange={(e) => {
                                const options = [...tf.options];
                                options[i] = e.target.value;
                                updateTierField(t.key, tf.key, { options });
                              }}
                            />
                            <span className="shrink-0 text-xs text-gray-500">+$</span>
                            <input
                              type="number"
                              step="0.01"
                              className={inputBase + " w-20 shrink-0"}
                              placeholder="0"
                              value={tf.option_prices[i] ? (tf.option_prices[i] / 100).toString() : ""}
                              onChange={(e) => {
                                const option_prices = tf.options.map((_, j) =>
                                  j === i ? Math.round((parseFloat(e.target.value) || 0) * 100) : tf.option_prices[j] ?? 0
                                );
                                updateTierField(t.key, tf.key, { option_prices });
                              }}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateTierField(t.key, tf.key, {
                                  options: tf.options.filter((_, j) => j !== i),
                                  option_prices: tf.option_prices.filter((_, j) => j !== i),
                                })
                              }
                              className="shrink-0 px-1 text-gray-400 hover:text-red-600"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            updateTierField(t.key, tf.key, {
                              options: [...tf.options, ""],
                              option_prices: [...tf.option_prices, 0],
                            })
                          }
                          className="text-xs font-medium text-blue-600 hover:text-blue-800"
                        >
                          + Add choice
                        </button>
                      </div>
                    )}
                    {(tf.field_type === "yesno" || tf.field_type === "checkbox") && (
                      <div className="flex flex-wrap items-center gap-1.5 pl-1 text-xs text-gray-600 dark:text-gray-400">
                        <span>Add to this attendee&rsquo;s price when {tf.field_type === "yesno" ? "Yes" : "checked"}:</span>
                        <span className="text-gray-500">$</span>
                        <input
                          type="number"
                          step="0.01"
                          className={inputBase + " w-24"}
                          placeholder="0.00"
                          value={tf.price_adjust_cents ? (tf.price_adjust_cents / 100).toString() : ""}
                          onChange={(e) =>
                            updateTierField(t.key, tf.key, {
                              price_adjust_cents: Math.round((parseFloat(e.target.value) || 0) * 100),
                            })
                          }
                        />
                        <span className="text-gray-400">(negative = discount)</span>
                      </div>
                    )}
                    <DependsOnPicker
                      rows={t.fields}
                      row={tf}
                      parentValue={tf.parent_value ?? ""}
                      onChange={(patch) => updateTierField(t.key, tf.key, patch)}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addTierField(t.key)}
                  className="text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                  + Add detail
                </button>
              </div>
            )}
          </div>
        ))}
      </section>

      {/* Custom fields */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Form fields</h2>
          <button type="button" onClick={addField} className="text-sm font-medium text-blue-600 hover:text-blue-800">
            + Add field
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Extra questions to ask each person. Name, email, and phone are always collected.
        </p>
        {fields.map((f, i) => (
          <div key={f.key} className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 space-y-2">
            <input
              className={input}
              placeholder="Question label (e.g. Dietary restrictions)"
              value={f.label}
              onChange={(e) => updateField(f.key, { label: e.target.value })}
            />
            {f.field_type === "select" && (
              <textarea
                className={input}
                rows={3}
                placeholder="One choice per line"
                value={f.options.join("\n")}
                onChange={(e) => updateField(f.key, { options: e.target.value.split("\n") })}
              />
            )}
            <div className="flex items-center gap-3">
              <select
                className={inputBase + " w-40 shrink-0"}
                value={f.field_type}
                onChange={(e) => updateField(f.key, { field_type: e.target.value as EventFieldType })}
              >
                {FIELD_TYPES.map((ft) => (
                  <option key={ft.value} value={ft.value}>
                    {ft.label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => updateField(f.key, { required: e.target.checked })}
                />
                Required
              </label>
              <div className="ml-auto flex items-center gap-1 text-gray-400">
                <button type="button" onClick={() => moveField(f.key, -1)} disabled={i === 0} className="px-1 disabled:opacity-30 hover:text-gray-700">
                  ↑
                </button>
                <button type="button" onClick={() => moveField(f.key, 1)} disabled={i === fields.length - 1} className="px-1 disabled:opacity-30 hover:text-gray-700">
                  ↓
                </button>
                <button type="button" onClick={() => removeField(f.key)} className="px-1 hover:text-red-600">
                  ✕
                </button>
              </div>
            </div>
            <DependsOnPicker
              rows={fields}
              row={f}
              parentValue={f.parent_value ?? ""}
              onChange={(patch) => updateField(f.key, patch)}
            />
          </div>
        ))}
      </section>

      {/* Payment */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Payment</h2>
        <div>
          <label className={label}>Pay link (Venmo, PayPal, etc.)</label>
          <input className={input} value={payUrl} onChange={(e) => setPayUrl(e.target.value)} placeholder="https://venmo.com/u/yourname" />
        </div>
        <div>
          <label className={label}>Payment instructions</label>
          <textarea className={input} rows={2} value={payInstructions} onChange={(e) => setPayInstructions(e.target.value)} placeholder="Pay your total via the link above. Add your kid's name in the note." />
        </div>
      </section>

      <div className="flex items-center gap-3 sticky bottom-0 bg-gray-50 dark:bg-gray-950 py-4 -mx-4 px-4 border-t border-gray-200 dark:border-gray-800">
        <button
          onClick={handleSave}
          disabled={pending || imgUploading}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : event ? "Save changes" : "Create event"}
        </button>
        <button onClick={() => router.push("/events")} className="text-sm font-medium text-gray-500 hover:text-gray-700">
          Cancel
        </button>
      </div>
    </div>
  );
}
