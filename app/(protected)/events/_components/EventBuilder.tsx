"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  saveEvent,
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

type TeamOption = { id: string; name: string };

type FieldRow = EventFieldInput & { key: string };
type TierFieldRow = EventTierFieldInput & { key: string };
type TierRow = {
  key: string;
  id?: string;
  label: string;
  dollars: string;
  is_player: boolean;
  collect_attendees: boolean;
  player_attributes: string[];
  is_sibling: boolean;
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
}: {
  teams: TeamOption[];
  event?: EventWithDetails;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [imgUploading, setImgUploading] = useState(false);

  const [teamId, setTeamId] = useState<string | null>(event?.team_id ?? null);
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [startsAt, setStartsAt] = useState(toLocalInput(event?.starts_at ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(event?.ends_at ?? null));
  const [deadline, setDeadline] = useState(toLocalInput(event?.signup_deadline ?? null));
  const [payUrl, setPayUrl] = useState(event?.pay_url ?? "");
  const [payInstructions, setPayInstructions] = useState(event?.pay_instructions ?? "");
  const [imageUrls, setImageUrls] = useState<string[]>(event?.image_urls ?? []);

  const [fields, setFields] = useState<FieldRow[]>(
    (event?.event_fields ?? []).map((f) => ({
      key: newKey(),
      id: f.id,
      label: f.label,
      field_type: f.field_type,
      options: f.options ?? [],
      required: f.required,
    }))
  );
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
      fields: [...(t.event_tier_fields ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((f) => ({
          key: newKey(),
          id: f.id,
          label: f.label,
          field_type: f.field_type,
          options: f.options ?? [],
          required: f.required,
        })),
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
      { key: newKey(), label: "", field_type: "text", options: [], required: false },
    ]);
  const updateField = (key: string, patch: Partial<FieldRow>) =>
    setFields((f) => f.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const removeField = (key: string) => setFields((f) => f.filter((x) => x.key !== key));
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
                { key: newKey(), label: "", field_type: "text", options: [], required: false },
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
  const removeTierField = (tierKey: string, fieldKey: string) =>
    setTiers((t) =>
      t.map((x) =>
        x.key === tierKey ? { ...x, fields: x.fields.filter((f) => f.key !== fieldKey) } : x
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
  // Only one tier can be the sibling tier; flagging it implies collecting names.
  const setSiblingTier = (tierKey: string, on: boolean) =>
    setTiers((t) =>
      t.map((x) =>
        x.key === tierKey
          ? { ...x, is_sibling: on, collect_attendees: on ? true : x.collect_attendees }
          : { ...x, is_sibling: on ? false : x.is_sibling }
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
      team_id: teamId,
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
      })),
      tiers: tiers.map((t) => ({
        id: t.id,
        label: t.label,
        amount_cents: Math.round(parseFloat(t.dollars || "0") * 100) || 0,
        is_player: t.is_player,
        collect_attendees: t.collect_attendees,
        player_attributes: t.player_attributes,
        is_sibling: t.is_sibling,
        fields: t.fields.map((f) => ({
          id: f.id,
          label: f.label,
          field_type: f.field_type,
          options: f.field_type === "select" ? f.options.filter((o) => o.trim()) : [],
          required: f.required,
        })),
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
            <label className={label}>Team (for sending invites)</label>
            <select className={input} value={teamId ?? ""} onChange={(e) => setTeamId(e.target.value || null)}>
              <option value="">— None —</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
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
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={t.is_sibling}
                  onChange={(e) => setSiblingTier(t.key, e.target.checked)}
                />
                This is the Sibling tier — remember &amp; pre-fill the family&apos;s siblings next time
              </label>
            )}

            {t.collect_attendees && (
              <div className="ml-6 space-y-2 border-l border-gray-200 dark:border-gray-800 pl-3">
                <div className="space-y-1">
                  <p className="text-xs text-gray-400">
                    {t.is_player
                      ? "Pre-fill these roster fields per kid (parents can edit if wrong):"
                      : t.is_sibling
                        ? "Collect these per sibling — saved & pre-filled next time:"
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
                      <button
                        type="button"
                        onClick={() => removeTierField(t.key, tf.key)}
                        className="shrink-0 px-1 text-gray-400 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </div>
                    {tf.field_type === "select" && (
                      <textarea
                        className={input}
                        rows={2}
                        placeholder="One choice per line (e.g. YS, YM, YL)"
                        value={tf.options.join("\n")}
                        onChange={(e) =>
                          updateTierField(t.key, tf.key, { options: e.target.value.split("\n") })
                        }
                      />
                    )}
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
