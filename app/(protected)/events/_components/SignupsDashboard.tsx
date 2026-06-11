"use client";

import { useState, useTransition } from "react";
import { togglePaid, updateSignupNotes } from "../actions";
import type { EventField, EventSignup } from "@/lib/types";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

type Metrics = {
  opensTotal: number;
  opensUnique: number;
  recentOpens: { name: string; at: string }[];
};

export default function SignupsDashboard({
  fields,
  signups: initial,
  metrics,
}: {
  fields: EventField[];
  signups: EventSignup[];
  metrics: Metrics;
}) {
  const [signups, setSignups] = useState(initial);
  const [openMetrics, setOpenMetrics] = useState(false);

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
