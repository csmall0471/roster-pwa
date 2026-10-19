"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { renderMarkdown, markdownClass } from "@/lib/markdown";
import { fieldVisible, stripHiddenValues } from "@/lib/events/field-visibility";
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

// Sanitized "who's coming" summary built server-side — one entry per family:
// the lead (player) name(s) plus a summary of the rest (e.g. ["2 siblings",
// "2 adults"]). Names/counts only — no contact info or amounts.
export type AttendanceSummary = {
  total: number;
  families: { lead: string; extras: string[] }[];
};

// Shape shared by event fields and tier attendee fields.
type GenericField = {
  id: string;
  label: string;
  field_type: EventFieldType;
  options: string[];
  required: boolean;
  priceAdjustCents?: number; // +/- to the attendee's price when yes/checked (tier fields only)
  optionPrices?: number[]; // for select fields: cents per option, index-aligned with options
  // Dependent fields: hidden until the parent field's answer matches (see
  // lib/events/field-visibility).
  parent_field_id?: string | null;
  parent_value?: string | null;
  // Optional explanation + example images rendered under the question.
  help_text?: string | null;
  help_images?: string[];
};

type AttendeeDraft = {
  key: string;
  name: string;
  playerId: string | null;
  attributes: Record<string, string | number | boolean>;
  status: AttendeeStatus;
  // Roster kids only: ids of the teammates this kid wants to sit by (max 3).
  sitBy: string[];
  // Sibling tier only: first/last edited separately (last is pre-filled with the
  // family surname). `name` stays the combined source of truth for submit.
  firstName?: string;
  lastName?: string;
};

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const splitName = (full: string): { firstName: string; lastName: string } => {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? "", lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
};
const joinName = (first: string, last: string) => `${(first ?? "").trim()} ${(last ?? "").trim()}`.trim();

let keySeq = 0;
const newKey = () => `a${keySeq++}`;

function normalizePhone(raw: string): string {
  const t = raw.trim();
  return t.startsWith("+") ? t : `+1${t.replace(/\D/g, "")}`;
}

const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none";
const labelCls = "block text-sm font-medium text-gray-700 mb-1";

export default function SignupFlow({
  event,
  attendance,
  sitByChoices = [],
}: {
  event: EventWithDetails;
  attendance: AttendanceSummary;
  // Active roster kids ("First L.") offered as "sit by" picks — empty/absent
  // when the event doesn't collect seating preferences.
  sitByChoices?: { id: string; name: string }[];
}) {
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
  // Family surname (from the kids/parent), pre-filled as a new sibling's last name.
  const [familyLast, setFamilyLast] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<SubmitSignupResult, { ok: true }> | null>(null);
  // They previously declined this event — show a gentle banner so they know
  // their current status, while leaving the form ready to change to "going".
  const [priorDeclined, setPriorDeclined] = useState(false);
  // Up-front RSVP gate: the first thing the form asks is "Can you make it?".
  // null until they choose; "yes" reveals the guided cards, "no" shows the
  // quick decline confirm. Prefilled from an existing signup.
  const [rsvpChoice, setRsvpChoice] = useState<"yes" | "no" | null>(null);

  // Guided form: the form step is a stack of collapsible cards ("Your info",
  // one per attendee tier, "Questions"). One is expanded at a time; Continue
  // collapses it, opens the next, and auto-scrolls there. Validation errors
  // jump back to the offending card.
  const [openSection, setOpenSection] = useState<string>("contact");
  const sectionRefs = useRef(new Map<string, HTMLElement | null>());
  const setSectionRef = useCallback((id: string, el: HTMLElement | null) => {
    sectionRefs.current.set(id, el);
  }, []);
  const goToSection = useCallback((id: string) => {
    setOpenSection(id);
    // Wait a beat so the newly-expanded card has its height before scrolling.
    setTimeout(() => {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      sectionRefs.current.get(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }, 90);
  }, []);

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
              parent_field_id: f.parent_field_id ?? null,
              parent_value: f.parent_value ?? null,
              help_text: f.help_text ?? null,
              help_images: f.help_images ?? [],
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
              options: c.options ?? [],
              required: false,
              priceAdjustCents: 0,
            }));
          const attendeeFields = [...commonFields, ...custom];
          return {
            ...t,
            attendeeFields,
            fieldsById: new Map(attendeeFields.map((f) => [f.id, f])),
          };
        }),
    [event.event_price_tiers]
  );

  // Event-level fields, by id, for dependent-field visibility checks.
  const eventFieldsById = useMemo(
    () => new Map((event.event_fields ?? []).map((f) => [f.id, f])),
    [event.event_fields]
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

      // Family surname for pre-filling a new sibling's last name: prefer the
      // kids' surname, else the parent's.
      const kidLast = parent.players[0]?.name.trim().split(/\s+/).pop() ?? "";
      setFamilyLast(kidLast || parent.last_name || "");

      const existing = parent.existing_signup;
      // A prior DECLINE shouldn't lock them into an empty form — show the banner
      // but fall through to a fresh kid-prefill so changing to "going" is easy.
      if (existing && !existing.declined) {
        setPriorDeclined(false);
        setRsvpChoice("yes"); // they already said yes — straight to the form
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
              const playerId = a.player_id ?? null;
              return {
                key: newKey(),
                name: a.name ?? "",
                playerId,
                attributes: attrs,
                status: a.status === "declined" ? "declined" : "attending",
                sitBy: playerId ? parent.sit_by_picks[playerId] ?? [] : [],
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
      setRsvpChoice(existing?.declined ? "no" : null);
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
              sitBy: parent.sit_by_picks[p.id] ?? [],
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
            const { firstName, lastName } = splitName(s.name);
            return { key: newKey(), name: s.name, firstName, lastName, playerId: null, attributes: attrs, status: "attending" as const, sitBy: [] };
          }),
        }));
      }

      // Prefill the Parent tier with BOTH parents (the family's parents, not just
      // whoever signed in). Only seed when nothing's there yet.
      const parentTier = tiers.find((t) => t.is_parent);
      const famParents = parent.family_parents.length
        ? parent.family_parents
        : [{ name: `${parent.first_name} ${parent.last_name}`.trim() }].filter((p) => p.name);
      if (parentTier && parentTier.collect_attendees && famParents.length) {
        setAttendees((a) =>
          a[parentTier.id]?.length
            ? a
            : {
                ...a,
                [parentTier.id]: famParents.map((p) => ({
                  key: newKey(),
                  name: p.name,
                  playerId: null,
                  attributes: {},
                  status: "attending" as const,
                  sitBy: [],
                })),
              }
        );
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
            if (!fieldVisible(f, a.attributes, t.fieldsById)) continue; // hidden = unanswered
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

  // ── Guided-card plumbing: order, completeness, summaries ────────────────────
  const collectTiers = useMemo(() => tiers.filter((t) => t.collect_attendees), [tiers]);
  const qtyTiers = useMemo(() => tiers.filter((t) => !t.collect_attendees), [tiers]);
  const sectionOrder = useMemo(
    () => [
      "contact",
      ...collectTiers.map((t) => `tier-${t.id}`),
      ...(qtyTiers.length ? ["extras"] : []),
      ...((event.event_fields ?? []).length ? ["questions"] : []),
      "review",
    ],
    [collectTiers, qtyTiers, event.event_fields]
  );
  const nextSection = (id: string) => sectionOrder[sectionOrder.indexOf(id) + 1] ?? "review";

  const filledVal = (v: unknown) => !(v === undefined || v === null || v === "" || v === false);

  function tierSubtotal(t: (typeof tiers)[number]): number {
    let sum = 0;
    for (const a of attendees[t.id] ?? []) {
      if (a.status === "declined") continue;
      let adj = 0;
      for (const f of t.attendeeFields) {
        if (!fieldVisible(f, a.attributes, t.fieldsById)) continue;
        if ((f.field_type === "yesno" || f.field_type === "checkbox") && a.attributes[f.id] === true) {
          adj += f.priceAdjustCents ?? 0;
        } else if (f.field_type === "select" && (f.optionPrices?.length ?? 0) > 0) {
          const idx = f.options.indexOf(a.attributes[f.id] as string);
          if (idx >= 0) adj += f.optionPrices![idx] ?? 0;
        }
      }
      sum += Math.max(0, t.amount_cents + adj);
    }
    return sum;
  }

  function tierComplete(t: (typeof tiers)[number]): boolean {
    return (attendees[t.id] ?? []).every(
      (a) =>
        a.status === "declined" ||
        (a.name.trim() !== "" &&
          t.attendeeFields.every(
            (f) =>
              !f.required ||
              !fieldVisible(f, a.attributes, t.fieldsById) ||
              filledVal(a.attributes[f.id])
          ))
    );
  }

  function tierSummary(t: (typeof tiers)[number]): string {
    const list = attendees[t.id] ?? [];
    const going = list.filter((a) => a.status !== "declined").length;
    const out = list.length - going;
    if (list.length === 0) return "Tap to add";
    const parts = [`${going} attending`];
    if (out > 0) parts.push(`${out} out`);
    const sub = tierSubtotal(t);
    if (sub > 0) parts.push(money(sub));
    return parts.join(" · ");
  }

  const visibleEventFields = (event.event_fields ?? []).filter((f) =>
    fieldVisible(f, responses, eventFieldsById)
  );
  const questionsComplete = visibleEventFields.every((f) => !f.required || filledVal(responses[f.id]));
  const questionsAnswered = visibleEventFields.filter((f) => filledVal(responses[f.id])).length;

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
  const addAttendee = (tier: { id: string; is_sibling: boolean }) =>
    setAttendees((a) => ({
      ...a,
      [tier.id]: [
        ...(a[tier.id] ?? []),
        tier.is_sibling
          ? { key: newKey(), name: familyLast, firstName: "", lastName: familyLast, playerId: null, attributes: {}, status: "attending" as const, sitBy: [] }
          : { key: newKey(), name: "", playerId: null, attributes: {}, status: "attending" as const, sitBy: [] },
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
    // On a validation miss, surface the message AND open + scroll to the card
    // it belongs to so phone users land right where the fix goes.
    const fail = (section: string, msg: string) => {
      setSubmitError(msg);
      goToSection(section);
    };
    if (!name.trim()) {
      fail("contact", "Please enter your name.");
      return;
    }
    // Required event fields (dependent fields only count while shown)
    for (const f of event.event_fields ?? []) {
      if (!f.required) continue;
      if (!fieldVisible(f, responses, eventFieldsById)) continue;
      const v = responses[f.id];
      if (v === undefined || v === null || v === "" || v === false) {
        fail("questions", `"${f.label}" is required.`);
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
          fail(`tier-${t.id}`, `Please enter a name for each ${t.label}.`);
          return;
        }
        for (const f of t.attendeeFields) {
          if (!f.required) continue;
          if (!fieldVisible(f, a.attributes, t.fieldsById)) continue;
          const v = a.attributes[f.id];
          if (v === undefined || v === null || v === "" || v === false) {
            fail(`tier-${t.id}`, `"${f.label}" is required for ${a.name || t.label}.`);
            return;
          }
        }
      }
    }

    // Build flat attendee list for the server.
    const out: {
      tier_id: string;
      name: string | null;
      player_id: string | null;
      attributes: Record<string, string | number | boolean>;
      status: AttendeeStatus;
    }[] = [];
    for (const t of tiers) {
      if (t.collect_attendees) {
        for (const a of attendees[t.id] ?? []) {
          // Strip answers of fields currently hidden by their dependency so a
          // flipped-back parent doesn't submit stale child values.
          out.push({
            tier_id: t.id,
            name: a.name.trim(),
            player_id: a.playerId ?? null,
            attributes: stripHiddenValues(t.attendeeFields, a.attributes),
            status: a.status,
          });
        }
      } else {
        const n = counts[t.id] ?? 0;
        for (let i = 0; i < n; i++)
          out.push({ tier_id: t.id, name: null, player_id: null, attributes: {}, status: "attending" });
      }
    }

    // Seating picks — one entry per attending roster kid with picks. Only sent
    // when the event offers the picker (so other events' picks stay untouched).
    let sitBy: { player_id: string; picked: string[] }[] | undefined;
    if (sitByChoices.length > 0) {
      sitBy = [];
      for (const t of tiers) {
        if (!t.collect_attendees || !t.is_player) continue;
        for (const a of attendees[t.id] ?? []) {
          if (a.playerId && a.status === "attending" && a.sitBy.length > 0)
            sitBy.push({ player_id: a.playerId, picked: a.sitBy.slice(0, 3) });
        }
      }
    }

    setSubmitting(true);
    const res = await submitSignup({
      event_id: event.id,
      parent_id: parentId,
      name,
      email,
      phone: contactPhone,
      responses: stripHiddenValues(event.event_fields ?? [], responses),
      attendees: out,
      sit_by: sitBy,
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
    // The decline panel carries its own name input, so no card-jumping needed.
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
      <div className={`mx-auto max-w-lg px-4 py-8 ${!checking && step === "form" && rsvpChoice === "yes" ? "pb-32" : ""}`}>
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

        {/* Who's coming */}
        <WhoIsComing attendance={attendance} />

        {/* Step card (the form step renders as its own card stack instead) */}
        <div
          className={
            !checking && step === "form"
              ? "mt-6"
              : "mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
          }
        >
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
            <div className="space-y-3">
              {/* The first question: are you coming at all? "Yes" reveals the
                  guided cards; "No" is a one-tap decline. Stays visible as a
                  toggle so changing your answer later is obvious. */}
              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-gray-900">Can you make it?</p>
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitError(null);
                      setRsvpChoice("yes");
                      if (rsvpChoice !== "yes") goToSection(openSection || "contact");
                    }}
                    className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
                      rsvpChoice === "yes"
                        ? "border-green-500 bg-green-50 text-green-700"
                        : "border-gray-300 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    🎉 Yes, we&rsquo;re in
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitError(null);
                      setRsvpChoice("no");
                    }}
                    className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
                      rsvpChoice === "no"
                        ? "border-red-400 bg-red-50 text-red-700"
                        : "border-gray-300 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    😢 Can&rsquo;t make it
                  </button>
                </div>
              </div>

              {/* Quick decline confirm */}
              {rsvpChoice === "no" && (
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  {priorDeclined ? (
                    <p className="text-sm text-gray-600">
                      You&rsquo;re marked as <strong>not attending</strong>. Change of plans? Tap{" "}
                      <strong>Yes, we&rsquo;re in</strong> above.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-600">
                        Sorry you&rsquo;ll miss it! Leave your name so the coach knows who&rsquo;s out.
                      </p>
                      <div>
                        <label className={labelCls}>Your name *</label>
                        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
                      </div>
                      {submitError && <p className="text-sm text-red-600">{submitError}</p>}
                      <button
                        onClick={handleDecline}
                        disabled={submitting || !name.trim()}
                        className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                      >
                        {submitting ? "Sending…" : "Confirm — we can't make it"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {rsvpChoice === "yes" && (
                <>
              {priorDeclined && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  You&rsquo;re currently marked <strong>not attending</strong> — fill this out and tap
                  <strong> Sign up</strong> to change that.
                </div>
              )}

              {/* 1 · Your info */}
              <SectionCard
                id="contact"
                index={1}
                title="Your info"
                summary={name.trim() || "Name & contact"}
                complete={name.trim() !== ""}
                open={openSection === "contact"}
                onToggle={() => setOpenSection(openSection === "contact" ? "" : "contact")}
                onContinue={() => goToSection(nextSection("contact"))}
                setRef={setSectionRef}
              >
                <div className="space-y-4">
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
              </SectionCard>

              {/* One card per attendee tier */}
              {collectTiers.map((t, ti) => (
                <SectionCard
                  key={t.id}
                  id={`tier-${t.id}`}
                  index={2 + ti}
                  title={`${t.label}${t.amount_cents ? ` · ${money(t.amount_cents)} each` : ""}`}
                  summary={tierSummary(t)}
                  complete={(attendees[t.id] ?? []).length > 0 && tierComplete(t)}
                  open={openSection === `tier-${t.id}`}
                  onToggle={() =>
                    setOpenSection(openSection === `tier-${t.id}` ? "" : `tier-${t.id}`)
                  }
                  onContinue={() => goToSection(nextSection(`tier-${t.id}`))}
                  setRef={setSectionRef}
                >
                    <div className="space-y-3">
                      {(attendees[t.id] ?? []).map((a) => {
                        const declined = a.status === "declined";
                        // Roster players (prefilled from the family) are fixed: name
                        // is read-only and they can't be removed — only attend/decline.
                        const lockedPlayer = t.is_player && a.playerId != null;
                        const nameCls = `${inputCls} ${declined ? "text-gray-400 line-through" : ""}`;
                        const split = splitName(a.name);
                        const fn = a.firstName ?? split.firstName;
                        const ln = a.lastName ?? split.lastName;
                        return (
                          <div key={a.key} className="rounded-lg bg-gray-50 p-2.5">
                            <div className="flex items-center gap-2">
                              {t.is_sibling ? (
                                <div className="flex flex-1 gap-2">
                                  <input
                                    className={nameCls}
                                    placeholder="First name"
                                    value={fn}
                                    onChange={(e) => updateAttendee(t.id, a.key, { firstName: e.target.value, lastName: ln, name: joinName(e.target.value, ln) })}
                                  />
                                  <input
                                    className={nameCls}
                                    placeholder="Last name"
                                    value={ln}
                                    onChange={(e) => updateAttendee(t.id, a.key, { firstName: fn, lastName: e.target.value, name: joinName(fn, e.target.value) })}
                                  />
                                </div>
                              ) : lockedPlayer ? (
                                <div className={`flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm ${declined ? "text-gray-400 line-through" : "text-gray-900"}`}>
                                  {a.name}
                                </div>
                              ) : (
                                <input
                                  className={nameCls}
                                  placeholder={`${t.label} name`}
                                  value={a.name}
                                  onChange={(e) => updateAttendee(t.id, a.key, { name: e.target.value })}
                                />
                              )}
                              {!lockedPlayer && (
                                <button
                                  type="button"
                                  onClick={() => removeAttendee(t.id, a.key)}
                                  className="shrink-0 px-1 text-gray-400 hover:text-red-600"
                                >
                                  ✕
                                </button>
                              )}
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
                            {t.is_player && a.playerId && a.status === "attending" && sitByChoices.length > 0 && (
                              <SitByPicker
                                kidName={a.name}
                                selfId={a.playerId}
                                choices={sitByChoices}
                                value={a.sitBy}
                                onChange={(ids) => updateAttendee(t.id, a.key, { sitBy: ids })}
                              />
                            )}
                            {!declined && t.attendeeFields.length > 0 && (
                              <div className="mt-2 space-y-2">
                                {t.attendeeFields
                                  .filter((f) => fieldVisible(f, a.attributes, t.fieldsById))
                                  .map((f) => (
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
                        onClick={() => addAttendee({ id: t.id, is_sibling: t.is_sibling })}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800"
                      >
                        + Add {t.label.toLowerCase()}
                      </button>
                    </div>
                </SectionCard>
              ))}

              {/* Quantity-only tiers grouped into one card */}
              {qtyTiers.length > 0 && (
                <SectionCard
                  id="extras"
                  index={2 + collectTiers.length}
                  title={collectTiers.length ? "Anyone else?" : "Attendees"}
                  summary={
                    qtyTiers.reduce((s, t) => s + (counts[t.id] ?? 0), 0) > 0
                      ? qtyTiers
                          .filter((t) => (counts[t.id] ?? 0) > 0)
                          .map((t) => `${counts[t.id]} × ${t.label}`)
                          .join(" · ")
                      : "Tap to add"
                  }
                  complete={qtyTiers.some((t) => (counts[t.id] ?? 0) > 0)}
                  open={openSection === "extras"}
                  onToggle={() => setOpenSection(openSection === "extras" ? "" : "extras")}
                  onContinue={() => goToSection(nextSection("extras"))}
                  setRef={setSectionRef}
                >
                  <div className="space-y-3">
                    {qtyTiers.map((t) => (
                      <div key={t.id} className="flex items-center justify-between">
                        <p className="text-sm text-gray-800">
                          {t.label} <span className="text-gray-400">· {money(t.amount_cents)}</span>
                        </p>
                        <QtyStepper value={counts[t.id] ?? 0} onChange={(n) => setCount(t.id, n)} />
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              {/* Event-level questions */}
              {(event.event_fields ?? []).length > 0 && (
                <SectionCard
                  id="questions"
                  index={2 + collectTiers.length + (qtyTiers.length ? 1 : 0)}
                  title="Questions"
                  summary={
                    visibleEventFields.length
                      ? `${questionsAnswered}/${visibleEventFields.length} answered`
                      : "A few quick questions"
                  }
                  complete={questionsComplete && questionsAnswered > 0}
                  open={openSection === "questions"}
                  onToggle={() => setOpenSection(openSection === "questions" ? "" : "questions")}
                  onContinue={() => goToSection(nextSection("questions"))}
                  continueLabel="Done →"
                  setRef={setSectionRef}
                >
                  <div className="space-y-4">
                    {visibleEventFields.map((f) => (
                      <FieldInput key={f.id} field={f} value={responses[f.id]} onChange={(v) => setResponse(f.id, v)} />
                    ))}
                  </div>
                </SectionCard>
              )}

              {/* Review / decline — the sticky bar below carries the submit. */}
              <div
                ref={(el) => setSectionRef("review", el)}
                className="scroll-mt-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between text-sm font-semibold text-gray-900">
                  <span>Total</span>
                  <span>{money(total)}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  All set? Tap <strong>Sign up</strong> below.
                </p>
              </div>
                </>
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
                  setRsvpChoice("yes"); // they tapped "changed my mind" — open the form
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

      {/* Sticky total + submit: always reachable on phones while filling the
          cards above. Validation errors show here (and auto-open their card). */}
      {!checking && step === "form" && rsvpChoice === "yes" && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur">
          <div className="mx-auto max-w-lg px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            {submitError && <p className="mb-2 text-sm text-red-600">{submitError}</p>}
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Total</p>
                <p className="text-lg font-bold leading-tight text-gray-900">{money(total)}</p>
              </div>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-xl bg-blue-600 px-8 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Sign up"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// One numbered, collapsible card of the guided signup. Collapsed it shows a
// one-line summary (and a green ✓ once complete); expanded it shows its fields
// plus a Continue button that walks to the next card.
function SectionCard({
  id,
  index,
  title,
  summary,
  complete,
  open,
  onToggle,
  onContinue,
  continueLabel,
  setRef,
  children,
}: {
  id: string;
  index: number;
  title: string;
  summary?: string;
  complete: boolean;
  open: boolean;
  onToggle: () => void;
  onContinue?: () => void;
  continueLabel?: string;
  setRef: (id: string, el: HTMLElement | null) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={(el) => setRef(id, el)}
      className={`scroll-mt-3 overflow-hidden rounded-2xl border bg-white shadow-sm transition-colors ${
        open ? "border-blue-200" : "border-gray-200"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            complete
              ? "bg-green-100 text-green-700"
              : open
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-500"
          }`}
        >
          {complete ? "✓" : index}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-gray-900">{title}</span>
          {!open && summary && <span className="block truncate text-xs text-gray-500">{summary}</span>}
        </span>
        <span className="text-gray-400">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3">
          {children}
          {onContinue && (
            <button
              type="button"
              onClick={onContinue}
              className="mt-4 w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
            >
              {continueLabel ?? "Continue →"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// A collapsible headcount so a parent can see the total who've RSVP'd and, on
// tap, one line per family — the player(s) plus a summary of the rest, e.g.
// "Ben Jewell + 2 siblings + 2 adults". Alphabetized. Names/counts only.
function WhoIsComing({ attendance }: { attendance: AttendanceSummary }) {
  const [open, setOpen] = useState(false);
  const { total, families } = attendance;

  if (total === 0) {
    return (
      <div className="mt-5 rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-center">
        <p className="text-sm font-semibold text-gray-900">Who&rsquo;s coming</p>
        <p className="mt-0.5 text-sm text-gray-500">No RSVPs yet — be the first! 🎉</p>
      </div>
    );
  }

  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3.5 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          👀 See who&rsquo;s coming
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
            {total}
          </span>
        </span>
        <span className="text-gray-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <ul className="divide-y divide-gray-100 border-t border-gray-100">
          {families.map((f, i) => (
            <li key={i} className="px-4 py-2.5 text-sm">
              <span className="font-medium text-gray-900">{f.lead}</span>
              {f.extras.length > 0 && (
                <span className="text-gray-500"> + {f.extras.join(" + ")}</span>
              )}
            </li>
          ))}
        </ul>
      )}
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

// Full-screen, swipeable viewer for a question's example images.
function Lightbox({
  images,
  start,
  title,
  onClose,
}: {
  images: string[];
  start: number;
  title: string;
  onClose: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(start);
  useEffect(() => {
    const el = trackRef.current;
    if (el) el.scrollTo({ left: start * el.clientWidth });
  }, [start]);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="min-w-0 truncate text-sm font-medium">
          {title}
          {images.length > 1 && <span className="text-white/60"> · {idx + 1}/{images.length}</span>}
        </span>
        <button type="button" onClick={onClose} aria-label="Close" className="px-2 text-xl leading-none">
          ✕
        </button>
      </div>
      <div
        ref={trackRef}
        onScroll={() => {
          const el = trackRef.current;
          if (el && el.clientWidth) setIdx(Math.round(el.scrollLeft / el.clientWidth));
        }}
        onClick={(e) => e.stopPropagation()}
        className="flex flex-1 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((url, i) => (
          <div key={url + i} className="flex w-full shrink-0 snap-center items-center justify-center p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <div className="flex justify-center gap-1.5 pb-6 pt-3">
          {images.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full ${i === idx ? "w-5 bg-white" : "w-1.5 bg-white/40"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

// A question's coach-written explanation + example images (e.g. the custom
// jersey design options): small text plus a swipeable thumbnail strip that
// opens the full-screen Lightbox on tap. Compact by design — phones first.
function FieldHelp({ field }: { field: GenericField }) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const text = field.help_text?.trim();
  const imgs = field.help_images ?? [];
  if (!text && imgs.length === 0) return null;
  return (
    <div className="mb-1.5 mt-0.5">
      {text && <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-500">{text}</p>}
      {imgs.length > 0 && (
        <div className="mt-1.5 flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {imgs.map((url, i) => (
            <button
              type="button"
              key={url + i}
              onClick={() => setLightbox(i)}
              className="shrink-0 snap-start"
              aria-label={`View image ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-20 w-28 rounded-lg border border-gray-200 object-cover" />
            </button>
          ))}
        </div>
      )}
      {lightbox != null && (
        <Lightbox images={imgs} start={lightbox} title={field.label} onClose={() => setLightbox(null)} />
      )}
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
  const help = <FieldHelp field={field} />;
  if (field.field_type === "textarea") {
    return (
      <div>
        <label className={labelCls}>{field.label}{req}</label>
        {help}
        <textarea className={inputCls} rows={3} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  if (field.field_type === "number") {
    return (
      <div>
        <label className={labelCls}>{field.label}{req}</label>
        {help}
        <input className={inputCls} type="number" value={(value as number | string) ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
      </div>
    );
  }
  if (field.field_type === "date") {
    return (
      <div>
        <label className={labelCls}>{field.label}{req}</label>
        {help}
        <input className={inputCls} type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  if (field.field_type === "select") {
    const cur = (value as string) ?? "";
    // Keep a prefilled value that isn't one of the choices (e.g. an older
    // free-text grade/size) selectable so it isn't silently dropped.
    const opts = cur && !field.options.includes(cur) ? [cur, ...field.options] : field.options;
    return (
      <div>
        <label className={labelCls}>{field.label}{req}</label>
        {help}
        <select className={inputCls} value={cur} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Select —</option>
          {opts.map((o) => {
            const i = field.options.indexOf(o);
            const p = i >= 0 ? field.optionPrices?.[i] ?? 0 : 0;
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
      <div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          {field.label}{req}{priceHint && <span className="text-gray-500">{priceHint}</span>}
        </label>
        {help}
      </div>
    );
  }
  if (field.field_type === "yesno") {
    return (
      <div>
        <label className={labelCls}>{field.label}{req}{priceHint && <span className="text-gray-500">{priceHint}</span>}</label>
        {help}
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
      {help}
      <input className={inputCls} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

// "Who should {kid} sit by?" — tap-to-toggle chips over the event's roster kids
// (max 3, never the kid themself). A filter input appears for long rosters.
function SitByPicker({
  kidName,
  selfId,
  choices,
  value,
  onChange,
}: {
  kidName: string;
  selfId: string;
  choices: { id: string; name: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [filter, setFilter] = useState("");
  const options = choices.filter((c) => c.id !== selfId);
  if (options.length === 0) return null;
  const q = filter.trim().toLowerCase();
  const shown = q ? options.filter((c) => c.name.toLowerCase().includes(q)) : options;
  const firstName = kidName.trim().split(/\s+/)[0] || "they";
  const full = value.length >= 3;
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-gray-600">
        Who should {firstName} sit by? <span className="font-normal text-gray-400">(up to 3)</span>
      </p>
      {options.length > 15 && (
        <input
          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none"
          placeholder="Search teammates…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      )}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {shown.map((c) => {
          const selected = value.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              disabled={!selected && full}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                selected
                  ? "bg-blue-600 text-white"
                  : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white"
              }`}
            >
              {c.name}
            </button>
          );
        })}
        {shown.length === 0 && <span className="text-xs text-gray-400">No teammates match.</span>}
      </div>
    </div>
  );
}
