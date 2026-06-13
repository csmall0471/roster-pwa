"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { renderMarkdown, markdownClass } from "@/lib/markdown";
import {
  PLAYER_ATTRIBUTE_CATALOG,
  type AttendeeStatus,
  type EventFieldType,
  type EventWithDetails,
  type SignupPlayer,
} from "@/lib/types";
import {
  identifyParent,
  logEventView,
  submitSignup,
  type IdentifiedParent,
  type SubmitSignupResult,
} from "./actions";

type Step = "identify" | "otp" | "form" | "done";

// Shape shared by event fields and tier attendee fields.
type GenericField = {
  id: string;
  label: string;
  field_type: EventFieldType;
  options: string[];
  required: boolean;
  priceAdjustCents?: number; // +/- to the attendee's price when yes/checked (tier fields only)
  optionPrices?: number[]; // for select fields: cents per option, index-aligned with options
};

type AttendeeDraft = {
  key: string;
  name: string;
  playerId: string | null;
  attributes: Record<string, string | number | boolean>;
  status: AttendeeStatus;
};

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

let keySeq = 0;
const newKey = () => `a${keySeq++}`;

function normalizePhone(raw: string): string {
  const t = raw.trim();
  return t.startsWith("+") ? t : `+1${t.replace(/\D/g, "")}`;
}

const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none";
const labelCls = "block text-sm font-medium text-gray-700 mb-1";

export default function SignupFlow({ event }: { event: EventWithDetails }) {
  const [step, setStep] = useState<Step>("identify");
  // True until we've checked for an existing session (avoids flashing the phone
  // prompt at an already-logged-in parent).
  const [checking, setChecking] = useState(true);

  // identify / otp
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // form — contact
  const [parentId, setParentId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [responses, setResponses] = useState<Record<string, string | number | boolean>>({});

  // form — attendees per tier
  const [attendees, setAttendees] = useState<Record<string, AttendeeDraft[]>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<SubmitSignupResult, { ok: true }> | null>(null);
  // They previously declined this event — show a gentle banner so they know
  // their current status, while leaving the form ready to change to "going".
  const [priorDeclined, setPriorDeclined] = useState(false);

  const tiers = useMemo(
    () =>
      [...(event.event_price_tiers ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((t) => {
          const custom: GenericField[] = [...(t.event_tier_fields ?? [])]
            .sort((a, b) => a.position - b.position)
            .map((f) => ({
              id: f.id,
              label: f.label,
              field_type: f.field_type,
              options: f.options ?? [],
              required: f.required,
              priceAdjustCents: f.price_adjust_cents ?? 0,
              optionPrices: f.option_prices ?? [],
            }));
          // Common-attribute pseudo-fields (grade/shirt size/birthdate) for any
          // tier. Keyed by their label so the stored value is self-describing
          // (the server passes label keys through) and prefill round-trips.
          const commonFields: GenericField[] = (t.player_attributes ?? [])
            .map((key) => PLAYER_ATTRIBUTE_CATALOG.find((c) => c.key === key))
            .filter((c): c is (typeof PLAYER_ATTRIBUTE_CATALOG)[number] => Boolean(c))
            .map((c) => ({
              id: c.label,
              label: c.label,
              field_type: c.field_type,
              options: [],
              required: false,
              priceAdjustCents: 0,
            }));
          return { ...t, attendeeFields: [...commonFields, ...custom] };
        }),
    [event.event_price_tiers]
  );

  // Build a kid's prefilled attributes (keyed by attribute label) for the
  // Player tier's selected roster fields.
  const kidAttributes = useCallback(
    (kid: SignupPlayer, attrKeys: string[]): Record<string, string | number | boolean> => {
      const out: Record<string, string | number | boolean> = {};
      for (const key of attrKeys) {
        const c = PLAYER_ATTRIBUTE_CATALOG.find((x) => x.key === key);
        if (!c) continue;
        const v =
          key === "grade" ? kid.grade : key === "shirt_size" ? kid.shirt_size : kid.date_of_birth;
        if (v) out[c.label] = v;
      }
      return out;
    },
    []
  );

  // Apply a resolved parent: prefill contact + the Player tier from their kids.
  // If the parent already has a signup for this event, re-populate the WHOLE
  // form from that row so they edit it in place (no duplicate).
  const applyIdentified = useCallback(
    (parent: IdentifiedParent, fallbackPhone: string | null) => {
      setParentId(parent.parent_id);

      const existing = parent.existing_signup;
      // A prior DECLINE shouldn't lock them into an empty form — show the banner
      // but fall through to a fresh kid-prefill so changing to "going" is easy.
      if (existing && !existing.declined) {
        setPriorDeclined(false);
        setName(existing.name || `${parent.first_name} ${parent.last_name}`.trim());
        setEmail(existing.email ?? parent.email ?? "");
        setContactPhone(existing.phone ?? parent.phone ?? fallbackPhone ?? "");
        setResponses(existing.responses ?? {});

        // Rebuild per-tier attendees/counts from the stored signup. Stored
        // attribute keys are attribute/field LABELS (the server stores labels),
        // which is exactly how the form keys common-attribute fields — but
        // custom tier fields are keyed by id in the form, so map label → id.
        const nextAttendees: Record<string, AttendeeDraft[]> = {};
        const nextCounts: Record<string, number> = {};
        for (const t of tiers) {
          const rows = existing.attendees.filter((a) => a.tier_id === t.id);
          if (t.collect_attendees) {
            const labelToId = new Map(t.attendeeFields.map((f) => [f.label, f.id]));
            nextAttendees[t.id] = rows.map((a) => {
              const attrs: Record<string, string | number | boolean> = {};
              for (const [labelKey, v] of Object.entries(a.attributes ?? {})) {
                attrs[labelToId.get(labelKey) ?? labelKey] = v;
              }
              return {
                key: newKey(),
                name: a.name ?? "",
                playerId: null,
                attributes: attrs,
                status: a.status === "declined" ? "declined" : "attending",
              };
            });
          } else {
            nextCounts[t.id] = rows.length;
          }
        }
        setAttendees(nextAttendees);
        setCounts(nextCounts);
        return;
      }

      setPriorDeclined(Boolean(existing?.declined));
      setName(`${parent.first_name} ${parent.last_name}`.trim());
      setEmail(parent.email ?? "");
      setContactPhone(parent.phone ?? fallbackPhone ?? "");
      const playerTier = tiers.find((t) => t.is_player);
      if (playerTier && parent.players.length) {
        if (playerTier.collect_attendees) {
          setAttendees((a) => ({
            ...a,
            [playerTier.id]: parent.players.map((p) => ({
              key: newKey(),
              name: p.name,
              playerId: p.id,
              attributes: kidAttributes(p, playerTier.player_attributes ?? []),
              status: "attending",
            })),
          }));
        } else {
          setCounts((c) => ({ ...c, [playerTier.id]: parent.players.length }));
        }
      }

      // Prefill the Sibling tier from the family's saved siblings. Saved
      // attributes are label-keyed; convert them back to this tier's field ids.
      const siblingTier = tiers.find((t) => t.is_sibling);
      if (siblingTier && siblingTier.collect_attendees && parent.siblings.length) {
        const labelToId = new Map(siblingTier.attendeeFields.map((f) => [f.label, f.id]));
        setAttendees((a) => ({
          ...a,
          [siblingTier.id]: parent.siblings.map((s) => {
            const attrs: Record<string, string | number | boolean> = {};
            for (const [labelKey, v] of Object.entries(s.attributes ?? {})) {
              const fid = labelToId.get(labelKey);
              if (fid !== undefined) attrs[fid] = v;
            }
            return { key: newKey(), name: s.name, playerId: null, attributes: attrs, status: "attending" as const };
          }),
        }));
      }
    },
    [tiers, kidAttributes]
  );

  // On mount: log the open, and if the visitor already has a session, skip the
  // phone prompt and jump straight to a pre-filled form.
  useEffect(() => {
    let key = localStorage.getItem("ev_visitor_key");
    if (!key) {
      key = crypto.randomUUID();
      localStorage.setItem("ev_visitor_key", key);
    }
    logEventView(event.id, key).catch(() => {});

    identifyParent(event.id)
      .then((parent) => {
        if (parent) {
          applyIdentified(parent, null);
          setStep("form");
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [event.id, applyIdentified]);

  const total = useMemo(() => {
    let sum = 0;
    for (const t of tiers) {
      if (t.collect_attendees) {
        // Per attendee: base + adjustments for yes/checked priced fields (≥ 0).
        for (const a of attendees[t.id] ?? []) {
          if (a.status === "declined") continue;
          let adj = 0;
          for (const f of t.attendeeFields) {
            if ((f.field_type === "yesno" || f.field_type === "checkbox") && a.attributes[f.id] === true) {
              adj += f.priceAdjustCents ?? 0;
            } else if (f.field_type === "select" && (f.optionPrices?.length ?? 0) > 0) {
              const idx = f.options.indexOf(a.attributes[f.id] as string);
              if (idx >= 0) adj += f.optionPrices![idx] ?? 0;
            }
          }
          sum += Math.max(0, t.amount_cents + adj);
        }
      } else {
        sum += t.amount_cents * (counts[t.id] ?? 0);
      }
    }
    return sum;
  }, [tiers, attendees, counts]);

  async function sendCode() {
    setAuthError(null);
    setAuthBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({ phone: normalizePhone(phone) });
    setAuthBusy(false);
    if (error) setAuthError(error.message);
    else setStep("otp");
  }

  async function verifyCode() {
    setAuthError(null);
    setAuthBusy(true);
    const supabase = createClient();
    const normalized = normalizePhone(phone);
    const { error } = await supabase.auth.verifyOtp({
      phone: normalized,
      token: otp.trim(),
      type: "sms",
    });
    if (error) {
      setAuthBusy(false);
      setAuthError(error.message);
      return;
    }
    // Resolve the parent + kids via an authorized server action.
    const parent = await identifyParent(event.id);
    if (parent) applyIdentified(parent, normalized);
    else setContactPhone(normalized);
    setAuthBusy(false);
    setStep("form");
  }

  function setResponse(id: string, value: string | number | boolean) {
    setResponses((r) => ({ ...r, [id]: value }));
  }

  // Attendee helpers
  const addAttendee = (tierId: string) =>
    setAttendees((a) => ({
      ...a,
      [tierId]: [
        ...(a[tierId] ?? []),
        { key: newKey(), name: "", playerId: null, attributes: {}, status: "attending" },
      ],
    }));
  const removeAttendee = (tierId: string, key: string) =>
    setAttendees((a) => ({ ...a, [tierId]: (a[tierId] ?? []).filter((x) => x.key !== key) }));
  const updateAttendee = (tierId: string, key: string, patch: Partial<AttendeeDraft>) =>
    setAttendees((a) => ({
      ...a,
      [tierId]: (a[tierId] ?? []).map((x) => (x.key === key ? { ...x, ...patch } : x)),
    }));
  const setAttr = (tierId: string, key: string, fieldId: string, value: string | number | boolean) =>
    setAttendees((a) => ({
      ...a,
      [tierId]: (a[tierId] ?? []).map((x) =>
        x.key === key ? { ...x, attributes: { ...x.attributes, [fieldId]: value } } : x
      ),
    }));
  const setCount = (tierId: string, n: number) =>
    setCounts((c) => ({ ...c, [tierId]: Math.max(0, Math.min(99, n)) }));

  async function handleSubmit() {
    setSubmitError(null);
    if (!name.trim()) {
      setSubmitError("Please enter your name.");
      return;
    }
    // Required event fields
    for (const f of event.event_fields ?? []) {
      if (!f.required) continue;
      const v = responses[f.id];
      if (v === undefined || v === null || v === "" || v === false) {
        setSubmitError(`"${f.label}" is required.`);
        return;
      }
    }
    // Attendee names + required attendee fields. Declined attendees are still
    // recorded but skip validation (we don't need their details).
    for (const t of tiers) {
      if (!t.collect_attendees) continue;
      for (const a of attendees[t.id] ?? []) {
        if (a.status === "declined") continue;
        if (!a.name.trim()) {
          setSubmitError(`Please enter a name for each ${t.label}.`);
          return;
        }
        for (const f of t.attendeeFields) {
          if (!f.required) continue;
          const v = a.attributes[f.id];
          if (v === undefined || v === null || v === "" || v === false) {
            setSubmitError(`"${f.label}" is required for ${a.name || t.label}.`);
            return;
          }
        }
      }
    }

    // Build flat attendee list for the server.
    const out: {
      tier_id: string;
      name: string | null;
      attributes: Record<string, string | number | boolean>;
      status: AttendeeStatus;
    }[] = [];
    for (const t of tiers) {
      if (t.collect_attendees) {
        for (const a of attendees[t.id] ?? []) {
          out.push({ tier_id: t.id, name: a.name.trim(), attributes: a.attributes, status: a.status });
        }
      } else {
        const n = counts[t.id] ?? 0;
        for (let i = 0; i < n; i++)
          out.push({ tier_id: t.id, name: null, attributes: {}, status: "attending" });
      }
    }

    setSubmitting(true);
    const res = await submitSignup({
      event_id: event.id,
      parent_id: parentId,
      name,
      email,
      phone: contactPhone,
      responses,
      attendees: out,
    });
    setSubmitting(false);
    if ("error" in res) {
      setSubmitError(res.error);
      return;
    }
    setResult(res);
    setStep("done");
  }

  // "Can't make it" — record a decline with no attendees/charge, skipping the
  // form. Only the name is needed (it's prefilled for identified parents).
  async function handleDecline() {
    setSubmitError(null);
    if (!name.trim()) {
      setSubmitError("Please enter your name first.");
      return;
    }
    setSubmitting(true);
    const res = await submitSignup({
      event_id: event.id,
      parent_id: parentId,
      name,
      email,
      phone: contactPhone,
      responses: {},
      attendees: [],
      decline: true,
    });
    setSubmitting(false);
    if ("error" in res) {
      setSubmitError(res.error);
      return;
    }
    setResult(res);
    setStep("done");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 via-white to-white">
      <div className="mx-auto max-w-lg px-4 py-8">
        {/* Photo carousel */}
        <EventGallery images={event.image_urls ?? []} />
        <h1 className="text-2xl font-bold text-gray-900">{event.title}</h1>
        <EventMeta event={event} />
        {event.description && (
          <CollapsibleDescription html={renderMarkdown(event.description)} />
        )}

        {tiers.length > 0 && step !== "done" && (
          <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-sm font-semibold text-gray-900">Pricing</p>
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              {tiers.map((t) => (
                <li key={t.id} className="flex justify-between">
                  <span>{t.label}</span>
                  <span className="font-medium">{money(t.amount_cents)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Step card */}
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          {checking && (
            <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
          )}

          {!checking && step === "identify" && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Sign up</h2>
              <p className="mt-1 text-sm text-gray-500">
                Have an account? Enter your phone to verify and pre-fill your info and kids.
              </p>
              <div className="mt-4">
                <label className={labelCls}>Phone number</label>
                <input
                  className={inputCls}
                  type="tel"
                  inputMode="tel"
                  placeholder="(555) 123-4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              {authError && <p className="mt-2 text-sm text-red-600">{authError}</p>}
              <button
                onClick={sendCode}
                disabled={authBusy || !phone.trim()}
                className="mt-3 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {authBusy ? "Sending…" : "Send code"}
              </button>
              <div className="my-4 flex items-center gap-3 text-xs text-gray-400">
                <div className="h-px flex-1 bg-gray-200" />
                or
                <div className="h-px flex-1 bg-gray-200" />
              </div>
              <button
                onClick={() => setStep("form")}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Continue as guest
              </button>
            </div>
          )}

          {step === "otp" && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Enter your code</h2>
              <p className="mt-1 text-sm text-gray-500">
                We sent a 6-digit code to {normalizePhone(phone)}.
              </p>
              <input
                className={inputCls + " mt-4 tracking-widest text-center text-lg"}
                inputMode="numeric"
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
              {authError && <p className="mt-2 text-sm text-red-600">{authError}</p>}
              <button
                onClick={verifyCode}
                disabled={authBusy || otp.trim().length < 4}
                className="mt-3 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {authBusy ? "Verifying…" : "Verify & continue"}
              </button>
              <button
                onClick={() => {
                  setStep("identify");
                  setOtp("");
                  setAuthError(null);
                }}
                className="mt-3 w-full text-sm text-gray-500 hover:text-gray-700"
              >
                ← Use a different number
              </button>
            </div>
          )}

          {step === "form" && (
            <div className="space-y-5">
              {priorDeclined && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  You&rsquo;re currently marked <strong>not attending</strong>. Change your mind below and tap
                  <strong> Sign up</strong> to RSVP.
                </div>
              )}
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-gray-900">Your info</h2>
                <div>
                  <label className={labelCls}>Name *</label>
                  <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Email</label>
                    <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Phone</label>
                    <input className={inputCls} type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Tiers / attendees */}
              {tiers.map((t) => (
                <div key={t.id} className="rounded-xl border border-gray-200 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900">
                      {t.label} <span className="text-gray-400">· {money(t.amount_cents)}</span>
                    </p>
                    {!t.collect_attendees && (
                      <QtyStepper value={counts[t.id] ?? 0} onChange={(n) => setCount(t.id, n)} />
                    )}
                  </div>

                  {t.collect_attendees && (
                    <div className="mt-2 space-y-3">
                      {(attendees[t.id] ?? []).map((a) => {
                        const declined = a.status === "declined";
                        return (
                          <div key={a.key} className="rounded-lg bg-gray-50 p-2.5">
                            <div className="flex items-center gap-2">
                              <input
                                className={`${inputCls} ${declined ? "text-gray-400 line-through" : ""}`}
                                placeholder={`${t.label} name`}
                                value={a.name}
                                onChange={(e) => updateAttendee(t.id, a.key, { name: e.target.value })}
                              />
                              <button
                                type="button"
                                onClick={() => removeAttendee(t.id, a.key)}
                                className="shrink-0 px-1 text-gray-400 hover:text-red-600"
                              >
                                ✕
                              </button>
                            </div>
                            <div className="mt-2 inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs font-medium">
                              {(["attending", "declined"] as const).map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() => updateAttendee(t.id, a.key, { status: s })}
                                  className={`rounded-md px-3 py-1 ${
                                    a.status === s
                                      ? s === "declined"
                                        ? "bg-red-100 text-red-700"
                                        : "bg-green-100 text-green-700"
                                      : "text-gray-500 hover:text-gray-700"
                                  }`}
                                >
                                  {s === "declined" ? "Not attending" : "Attending"}
                                </button>
                              ))}
                            </div>
                            {!declined && t.attendeeFields.length > 0 && (
                              <div className="mt-2 space-y-2">
                                {t.attendeeFields.map((f) => (
                                  <FieldInput
                                    key={f.id}
                                    field={f}
                                    value={a.attributes[f.id]}
                                    onChange={(v) => setAttr(t.id, a.key, f.id, v)}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => addAttendee(t.id)}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800"
                      >
                        + Add {t.label.toLowerCase()}
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {total > 0 && (
                <div className="flex justify-between rounded-xl bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900">
                  <span>Total</span>
                  <span>{money(total)}</span>
                </div>
              )}

              {/* Event-level custom fields */}
              {(event.event_fields ?? []).map((f) => (
                <FieldInput key={f.id} field={f} value={responses[f.id]} onChange={(v) => setResponse(f.id, v)} />
              ))}

              {submitError && <p className="text-sm text-red-600">{submitError}</p>}
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Sign up"}
              </button>
              {!priorDeclined && (
                <button
                  onClick={handleDecline}
                  disabled={submitting}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  Can&rsquo;t make it
                </button>
              )}
            </div>
          )}

          {step === "done" && result && result.declined && (
            <div className="text-center">
              <div className="text-4xl">👍</div>
              <h2 className="mt-2 text-lg font-semibold text-gray-900">Thanks for letting us know</h2>
              <p className="mt-1 text-sm text-gray-600">
                You&rsquo;re marked as <span className="font-semibold">not attending</span>.
              </p>
              <button
                onClick={() => {
                  setResult(null);
                  setPriorDeclined(true);
                  setStep("form");
                }}
                className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Changed my mind — RSVP
              </button>
              {parentId && (
                <a
                  href="/parent/dashboard"
                  className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Back to the dashboard
                </a>
              )}
            </div>
          )}

          {step === "done" && result && !result.declined && (
            <div className="text-center">
              <div className="text-4xl">🎉</div>
              <h2 className="mt-2 text-lg font-semibold text-gray-900">You&apos;re signed up!</h2>
              {result.total_cents > 0 && (
                <p className="mt-1 text-sm text-gray-600">
                  Your total is <span className="font-semibold">{money(result.total_cents)}</span>.
                </p>
              )}
              {result.pay_instructions && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-500">{result.pay_instructions}</p>
              )}
              {result.pay_url && (
                <a
                  href={result.pay_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
                >
                  Pay now{result.total_cents > 0 ? ` · ${money(result.total_cents)}` : ""}
                </a>
              )}
              {parentId && (
                <a
                  href="/parent/dashboard"
                  className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Back to the dashboard
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Top-of-page photo carousel: a swipeable, snap-scrolling slideshow of all the
// event images that also auto-advances. A single image renders as a plain hero;
// 2+ get dots + auto-rotation (paused briefly after the visitor interacts).
function EventGallery({ images }: { images: string[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const pausedUntil = useRef(0);

  const scrollToSlide = useCallback((i: number, smooth = true) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  };

  const pause = () => {
    pausedUntil.current = Date.now() + 8000;
  };

  // Auto-advance every few seconds, skipping while the visitor is interacting.
  useEffect(() => {
    if (images.length < 2) return;
    const id = setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      const el = trackRef.current;
      if (!el) return;
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % images.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    }, 4500);
    return () => clearInterval(id);
  }, [images.length]);

  if (images.length === 0) return null;
  if (images.length === 1) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={images[0]} alt="" className="mb-5 h-52 w-full rounded-2xl object-cover shadow-sm" />
    );
  }

  return (
    <div className="mb-5">
      <div
        ref={trackRef}
        onScroll={onScroll}
        onPointerDown={pause}
        onTouchStart={pause}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-2xl shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={url}
            alt=""
            className="h-52 w-full shrink-0 snap-center object-cover"
          />
        ))}
      </div>
      <div className="mt-2 flex justify-center gap-1.5">
        {images.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Photo ${i + 1}`}
            onClick={() => {
              pause();
              scrollToSlide(i);
            }}
            className={`h-1.5 rounded-full transition-all ${
              i === active ? "w-5 bg-gray-700" : "w-1.5 bg-gray-300 hover:bg-gray-400"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// Event description that clamps to a few lines with a "Show more / Show less"
// toggle. The toggle only appears when the rendered markdown actually overflows
// the collapsed height (measured on mount / when the content changes).
function CollapsibleDescription({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const COLLAPSED_PX = 132;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollHeight > COLLAPSED_PX + 16);
    check();
    // Re-check once fonts/images settle so a borderline description toggles right.
    const t = setTimeout(check, 300);
    return () => clearTimeout(t);
  }, [html]);

  const clamp = overflows && !expanded;

  return (
    <div className="mt-3">
      <div className="relative">
        <div
          ref={ref}
          className={`text-gray-600 ${markdownClass} overflow-hidden`}
          style={{ maxHeight: clamp ? COLLAPSED_PX : undefined }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {clamp && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent" />
        )}
      </div>
      {overflows && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-sm font-semibold text-blue-600 hover:text-blue-800"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function EventMeta({ event }: { event: EventWithDetails }) {
  const parts: string[] = [];
  if (event.starts_at) {
    parts.push(
      new Date(event.starts_at).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    );
  }
  if (event.location) parts.push(event.location);
  if (!parts.length) return null;
  return <p className="mt-1 text-sm text-gray-500">{parts.join(" · ")}</p>;
}

function QtyStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        className="h-7 w-7 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50"
      >
        −
      </button>
      <span className="w-6 text-center text-sm font-medium">{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="h-7 w-7 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50"
      >
        +
      </button>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: GenericField;
  value: string | number | boolean | undefined;
  onChange: (v: string | number | boolean) => void;
}) {
  const req = field.required ? " *" : "";
  // Price hint shown on the toggle fields that adjust the attendee's price.
  const adj = field.priceAdjustCents || 0;
  const priceHint =
    adj && (field.field_type === "yesno" || field.field_type === "checkbox")
      ? ` (${adj > 0 ? "+" : "−"}${money(Math.abs(adj))})`
      : "";
  if (field.field_type === "textarea") {
    return (
      <div>
        <label className={labelCls}>{field.label}{req}</label>
        <textarea className={inputCls} rows={3} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  if (field.field_type === "number") {
    return (
      <div>
        <label className={labelCls}>{field.label}{req}</label>
        <input className={inputCls} type="number" value={(value as number | string) ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
      </div>
    );
  }
  if (field.field_type === "select") {
    return (
      <div>
        <label className={labelCls}>{field.label}{req}</label>
        <select className={inputCls} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Select —</option>
          {field.options.map((o, i) => {
            const p = field.optionPrices?.[i] ?? 0;
            return (
              <option key={o} value={o}>{o}{p ? ` (${p > 0 ? "+" : "−"}${money(Math.abs(p))})` : ""}</option>
            );
          })}
        </select>
      </div>
    );
  }
  if (field.field_type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        {field.label}{req}{priceHint && <span className="text-gray-500">{priceHint}</span>}
      </label>
    );
  }
  if (field.field_type === "yesno") {
    return (
      <div>
        <label className={labelCls}>{field.label}{req}{priceHint && <span className="text-gray-500">{priceHint}</span>}</label>
        <div className="flex gap-2">
          {[true, false].map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => onChange(v)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                value === v
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {v ? "Yes" : "No"}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div>
      <label className={labelCls}>{field.label}{req}</label>
      <input className={inputCls} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
