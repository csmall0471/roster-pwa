"use client";

import { useMemo, useState, useTransition } from "react";
import { togglePaid, updateSignupNotes } from "../actions";
import type {
  EventField,
  EventPriceTier,
  EventSignup,
  SignupAttendee,
} from "@/lib/types";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// ── Attendance roll-up ─────────────────────────────────────────────────────
// A "participant type" is a price tier. Players/Siblings/Parents get canonical
// labels via their tier flags; any other tier keeps its coach-given label.
type Cat = { key: string; plural: string; singular: string; order: number };
type Person = { key: string; name: string; badge: string; family: string; order: number };
type TypeCount = { key: string; label: string; attending: number; declined: number; order: number };

function tierCat(t: EventPriceTier): Cat {
  if (t.is_player) return { key: "player", plural: "Players", singular: "Player", order: 0 };
  if (t.is_sibling) return { key: "sibling", plural: "Siblings", singular: "Sibling", order: 1 };
  if (t.is_parent) return { key: "parent", plural: "Parents", singular: "Parent", order: 2 };
  return { key: `t:${t.id}`, plural: t.label, singular: t.label, order: 3 + t.position };
}

// Roll signups up into per-type counts and flat coming / not-coming lists.
// The SignupAttendee only carries is_player, so siblings/parents are resolved
// by joining tier_id back to the event's tiers.
function computeAttendance(signups: EventSignup[], tiers: EventPriceTier[]) {
  const byTierId = new Map(tiers.map((t) => [t.id, tierCat(t)]));
  const classify = (a: SignupAttendee): Cat =>
    byTierId.get(a.tier_id) ??
    (a.is_player
      ? { key: "player", plural: "Players", singular: "Player", order: 0 }
      : {
          key: a.tier_label || "other",
          plural: a.tier_label || "Other",
          singular: a.tier_label || "Other",
          order: 99,
        });

  const counts = new Map<string, TypeCount>();
  const coming: Person[] = [];
  const notComing: Person[] = [];
  let wholeFamilyOut = 0;

  const bump = (cat: Cat, declined: boolean) => {
    const c =
      counts.get(cat.key) ??
      { key: cat.key, label: cat.plural, attending: 0, declined: 0, order: cat.order };
    if (declined) c.declined++;
    else c.attending++;
    counts.set(cat.key, c);
  };

  for (const s of signups) {
    const family = s.name;
    const list = s.attendees ?? [];
    if (list.length === 0) {
      // No attendee rows: a "can't make it" decline for the whole family.
      if (s.declined) {
        notComing.push({ key: s.id, name: family, badge: "Whole family", family: "", order: -1 });
        wholeFamilyOut++;
      }
      continue;
    }
    // Count-only tiers have no names — group those into one "× N" line per tier.
    const unnamedComing = new Map<string, { cat: Cat; n: number }>();
    const unnamedOut = new Map<string, { cat: Cat; n: number }>();
    list.forEach((a, i) => {
      const cat = classify(a);
      const declined = a.status === "declined";
      bump(cat, declined);
      const nm = (a.name ?? "").trim();
      if (nm) {
        (declined ? notComing : coming).push({
          key: `${s.id}:${i}`,
          name: nm,
          badge: cat.singular,
          family,
          order: cat.order,
        });
      } else {
        const m = declined ? unnamedOut : unnamedComing;
        const e = m.get(cat.key) ?? { cat, n: 0 };
        e.n++;
        m.set(cat.key, e);
      }
    });
    for (const { cat, n } of unnamedComing.values())
      coming.push({ key: `${s.id}:${cat.key}:c`, name: `${cat.plural} × ${n}`, badge: cat.singular, family, order: cat.order });
    for (const { cat, n } of unnamedOut.values())
      notComing.push({ key: `${s.id}:${cat.key}:d`, name: `${cat.plural} × ${n}`, badge: cat.singular, family, order: cat.order });
  }

  const byOrderThenName = (a: Person, b: Person) =>
    a.order - b.order || a.name.localeCompare(b.name);
  coming.sort(byOrderThenName);
  notComing.sort(byOrderThenName);
  const types = [...counts.values()].sort((a, b) => a.order - b.order);
  const totalAttending = types.reduce((n, t) => n + t.attending, 0);
  const totalOut = types.reduce((n, t) => n + t.declined, 0) + wholeFamilyOut;
  return { types, coming, notComing, totalAttending, totalOut };
}

type Metrics = {
  opensTotal: number;
  opensUnique: number;
  recentOpens: { name: string; at: string }[];
};

export default function SignupsDashboard({
  fields,
  tiers,
  signups: initial,
  metrics,
}: {
  fields: EventField[];
  tiers: EventPriceTier[];
  signups: EventSignup[];
  metrics: Metrics;
}) {
  const [signups, setSignups] = useState(initial);
  const [openMetrics, setOpenMetrics] = useState(false);
  const att = useMemo(() => computeAttendance(signups, tiers), [signups, tiers]);

  const grandTotal = signups.reduce((s, x) => s + x.total_cents, 0);
  const collected = signups.filter((s) => s.paid).reduce((s, x) => s + x.total_cents, 0);

  function applyPaid(id: string, paid: boolean) {
    setSignups((list) =>
      list.map((s) => (s.id === id ? { ...s, paid, paid_at: paid ? new Date().toISOString() : null } : s))
    );
  }

  return (
    <div className="space-y-6">
      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Link opens" value={String(metrics.opensTotal)} sub={`${metrics.opensUnique} unique`} />
        <Stat label="Signups" value={String(signups.length)} />
        <Stat label="Total owed" value={money(grandTotal)} />
        <Stat label="Collected" value={money(collected)} sub={`${money(grandTotal - collected)} outstanding`} />
      </div>

      {/* Attendance roll-up: counts per participant type + coming/not-coming */}
      {att.totalAttending + att.totalOut > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {att.types.map((t) => (
              <div
                key={t.key}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900"
              >
                <span className="text-xl font-bold text-gray-900 dark:text-white">{t.attending}</span>{" "}
                <span className="text-sm text-gray-600 dark:text-gray-300">{t.label}</span>
                {t.declined > 0 && (
                  <span className="ml-1 text-xs text-gray-400">(+{t.declined} out)</span>
                )}
              </div>
            ))}
            <div className="rounded-xl bg-gray-900 px-3 py-2 text-white dark:bg-white dark:text-gray-900">
              <span className="text-xl font-bold">{att.totalAttending}</span>{" "}
              <span className="text-sm opacity-80">coming</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <PeopleList
              title={`Coming (${att.totalAttending})`}
              people={att.coming}
              tone="green"
              empty="Nobody's confirmed yet."
            />
            <PeopleList
              title={`Not coming (${att.totalOut})`}
              people={att.notComing}
              tone="red"
              empty="Nobody's declined."
            />
          </div>
        </div>
      )}

      {/* Who opened */}
      {metrics.recentOpens.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <button
            onClick={() => setOpenMetrics((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            <span>Recent link opens</span>
            <span className="text-gray-400">{openMetrics ? "▲" : "▼"}</span>
          </button>
          {openMetrics && (
            <ul className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
              {metrics.recentOpens.map((o, i) => (
                <li key={i} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className="text-gray-700 dark:text-gray-300">{o.name}</span>
                  <span className="text-gray-400">
                    {new Date(o.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Signups */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
          Signups ({signups.length})
        </h2>
        {signups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-6 text-center text-sm text-gray-400">
            No signups yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {signups.map((s) => (
              <SignupRow key={s.id} signup={s} fields={fields} onPaid={applyPaid} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PeopleList({
  title,
  people,
  tone,
  empty,
}: {
  title: string;
  people: Person[];
  tone: "green" | "red";
  empty: string;
}) {
  const head =
    tone === "green"
      ? "bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300"
      : "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300";
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
      <div className={`px-4 py-2 text-sm font-semibold ${head}`}>{title}</div>
      {people.length === 0 ? (
        <p className="bg-white px-4 py-3 text-sm text-gray-400 dark:bg-gray-900">{empty}</p>
      ) : (
        <ul className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900">
          {people.map((p) => (
            <li key={p.key} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
              <span className="min-w-0 truncate text-gray-800 dark:text-gray-200">
                {p.name}
                {p.family && <span className="text-gray-400"> · {p.family}</span>}
              </span>
              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                {p.badge}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function SignupRow({
  signup,
  fields,
  onPaid,
}: {
  signup: EventSignup;
  fields: EventField[];
  onPaid: (id: string, paid: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(signup.coach_notes ?? "");
  const [savedNotes, setSavedNotes] = useState(signup.coach_notes ?? "");
  const [pending, start] = useTransition();

  function flipPaid() {
    const next = !signup.paid;
    onPaid(signup.id, next); // optimistic
    start(async () => {
      await togglePaid(signup.id, next);
    });
  }

  function saveNotes() {
    if (notes === savedNotes) return;
    setSavedNotes(notes);
    start(async () => {
      await updateSignupNotes(signup.id, notes);
    });
  }

  // Defensive: tolerate rows that predate the attendees/responses columns.
  const attendeeList = signup.attendees ?? [];
  const responseMap = signup.responses ?? {};

  const hasDetails =
    attendeeList.length > 0 ||
    Object.keys(responseMap).length > 0 ||
    signup.email ||
    signup.phone;

  // Group attendees by tier for display.
  const byTier = new Map<string, { label: string; amount_cents: number; rows: typeof attendeeList }>();
  for (const a of attendeeList) {
    const g = byTier.get(a.tier_id) ?? { label: a.tier_label, amount_cents: a.amount_cents, rows: [] };
    g.rows.push(a);
    byTier.set(a.tier_id, g);
  }

  return (
    <li className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white">
            {signup.name}
            {!signup.parent_id && (
              <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-500 dark:bg-gray-800">
                guest
              </span>
            )}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {new Date(signup.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            {signup.total_cents > 0 && <> · {money(signup.total_cents)}</>}
          </p>
        </div>
        <button
          onClick={flipPaid}
          disabled={pending}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-50 ${
            signup.paid
              ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
          }`}
        >
          {signup.paid ? "✓ Paid" : "Mark paid"}
        </button>
      </div>

      {hasDetails && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-800"
        >
          {expanded ? "Hide details" : "Details"}
        </button>
      )}

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-gray-100 dark:border-gray-800 pt-3 text-sm">
          {(signup.email || signup.phone) && (
            <p className="text-gray-600 dark:text-gray-400">
              {signup.email}
              {signup.email && signup.phone ? " · " : ""}
              {signup.phone}
            </p>
          )}

          {byTier.size > 0 && (
            <div className="space-y-2">
              {[...byTier.entries()].map(([tierId, g]) => {
                // Declined attendees are recorded but never charged, so the tier
                // subtotal counts only those actually attending.
                const attendingCount = g.rows.filter((a) => a.status !== "declined").length;
                return (
                  <div key={tierId}>
                    <div className="flex justify-between text-xs font-semibold uppercase tracking-wide text-gray-400">
                      <span>
                        {g.label} × {attendingCount}
                        {attendingCount !== g.rows.length && (
                          <span className="text-gray-300"> (+{g.rows.length - attendingCount} declined)</span>
                        )}
                      </span>
                      <span>{money(g.amount_cents * attendingCount)}</span>
                    </div>
                    <ul className="mt-1 space-y-1">
                      {g.rows.map((a, i) => {
                        const declined = a.status === "declined";
                        const attrs = Object.entries(a.attributes).filter(
                          ([, v]) => v !== "" && v !== null && v !== undefined && v !== false
                        );
                        if (!a.name && attrs.length === 0 && !declined) return null;
                        return (
                          <li
                            key={i}
                            className={declined ? "text-gray-400 line-through" : "text-gray-700 dark:text-gray-300"}
                          >
                            {a.name ?? "—"}
                            {declined && (
                              <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-600 no-underline dark:bg-red-900/40 dark:text-red-300">
                                declined
                              </span>
                            )}
                            {!declined && attrs.length > 0 && (
                              <span className="text-gray-400">
                                {" "}
                                ({attrs
                                  .map(([k, v]) => `${k}: ${typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)}`)
                                  .join(", ")})
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          {fields.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Responses</p>
              <dl className="mt-1 space-y-1">
                {fields.map((f) => {
                  const v = responseMap[f.id];
                  if (v === undefined || v === null || v === "") return null;
                  return (
                    <div key={f.id} className="flex justify-between gap-3">
                      <dt className="text-gray-500 dark:text-gray-400">{f.label}</dt>
                      <dd className="text-right text-gray-800 dark:text-gray-200">
                        {typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          )}

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Coach notes</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              rows={2}
              placeholder="Private notes (e.g. paid via Venmo 6/10)"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      )}
    </li>
  );
}
