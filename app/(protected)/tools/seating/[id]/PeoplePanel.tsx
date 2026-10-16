"use client";

import { useMemo, useState } from "react";
import type { DerivedStatus, PersonVM, PickVM } from "../types";
import { STATUS_RANK } from "../types";
import PersonChip, { isKid } from "./PersonChip";

export type StatusFilter = DerivedStatus | "all";
export type KindFilter = "all" | "kids" | "adults";

const STATUS_PILL: Record<DerivedStatus, string> = {
  planning: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  invited: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  opened: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  yes: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  no: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};
const STATUS_LABEL: Record<DerivedStatus, string> = {
  planning: "Planning",
  invited: "Invited",
  opened: "Opened",
  yes: "Yes",
  no: "No",
};
const STATUSES: DerivedStatus[] = ["planning", "invited", "opened", "yes", "no"];

// Yes-first inside each group (STATUS_RANK ascends toward "yes"), then name.
const byName = (a: PersonVM, b: PersonVM) =>
  STATUS_RANK[b.status] - STATUS_RANK[a.status] || a.displayName.localeCompare(b.displayName);

type Props = {
  people: PersonVM[];
  picks: PickVM[];
  selectedPersonId: string | null;
  search: string;
  onSearch: (v: string) => void;
  statusFilter: StatusFilter;
  onStatusFilter: (v: StatusFilter) => void;
  kindFilter: KindFilter;
  onKindFilter: (v: KindFilter) => void;
  eventLinked: boolean;
  unmatchedRsvpCount: number;
  onChipPointerDown: (p: PersonVM, e: React.PointerEvent) => void;
  onSetStatus: (personId: string, status: DerivedStatus | null) => void;
  onToggleLock: (p: PersonVM) => void;
  onUnassign: (p: PersonVM) => void;
  onRemove: (p: PersonVM) => void;
  onAddPick: (fromPersonId: string, toPersonId: string) => void;
  onRemovePick: (pickId: string) => void;
  onOpenAdd: () => void;
  onAddGuest: () => void;
  onSyncRsvps: () => void;
  onInvite: (personIds: string[]) => void;
};

export default function PeoplePanel({
  people,
  picks,
  selectedPersonId,
  search,
  onSearch,
  statusFilter,
  onStatusFilter,
  kindFilter,
  onKindFilter,
  eventLinked,
  unmatchedRsvpCount,
  onChipPointerDown,
  onSetStatus,
  onToggleLock,
  onUnassign,
  onRemove,
  onAddPick,
  onRemovePick,
  onOpenAdd,
  onAddGuest,
  onSyncRsvps,
  onInvite,
}: Props) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [picksFor, setPicksFor] = useState<string | null>(null);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  // Search + kind narrow the list; the status pills then narrow further.
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter((p) => {
      if (q && !p.displayName.toLowerCase().includes(q)) return false;
      if (kindFilter === "kids" && !isKid(p)) return false;
      if (kindFilter === "adults" && isKid(p)) return false;
      return true;
    });
  }, [people, search, kindFilter]);

  const statusCounts = useMemo(() => {
    const c: Record<DerivedStatus, number> = { planning: 0, invited: 0, opened: 0, yes: 0, no: 0 };
    for (const p of searched) c[p.status]++;
    return c;
  }, [searched]);

  const filtered = useMemo(
    () => (statusFilter === "all" ? searched : searched.filter((p) => p.status === statusFilter)),
    [searched, statusFilter]
  );

  // Totals strip counts the whole plan, independent of filters.
  const totals = useMemo(() => {
    const c: Record<DerivedStatus, number> = { planning: 0, invited: 0, opened: 0, yes: 0, no: 0 };
    for (const p of people) c[p.status]++;
    return c;
  }, [people]);

  const groups = useMemo(() => {
    const unassignedKids: PersonVM[] = [];
    const seatedList: PersonVM[] = [];
    const standing: PersonVM[] = [];
    const otherUnassigned: PersonVM[] = [];
    const out: PersonVM[] = [];
    for (const p of filtered) {
      if (p.seatId) seatedList.push(p);
      else if (p.inSro) standing.push(p);
      else if (p.status === "no") out.push(p);
      else if (isKid(p)) unassignedKids.push(p);
      else otherUnassigned.push(p);
    }
    return [
      { label: "Unassigned kids", list: unassignedKids.sort(byName) },
      { label: "Seated", list: seatedList.sort(byName) },
      { label: "Standing (SRO)", list: standing.sort(byName) },
      { label: "Unassigned adults", list: otherUnassigned.sort(byName) },
      { label: "Out (no)", list: out.sort(byName) },
    ].filter((g) => g.list.length > 0);
  }, [filtered]);

  const inviteIds = filtered.filter((p) => p.status === "planning").map((p) => p.id);

  const pillBase = "rounded-full px-2 py-0.5 text-[11px] font-semibold transition-shadow";
  const footerBtn =
    "w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800";

  function menuItem(label: string, onClick: () => void, danger = false) {
    return (
      <button
        key={label}
        type="button"
        onClick={() => {
          setMenuFor(null);
          onClick();
        }}
        className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${
          danger ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-200"
        }`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-240px)] lg:overflow-y-auto">
      <input
        type="search"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Search people…"
        className="input"
      />

      {/* Status filter pills */}
      <div className="mt-2 flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => onStatusFilter("all")}
          className={`${pillBase} bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 ${
            statusFilter === "all" ? "ring-2 ring-blue-500/70" : ""
          }`}
        >
          All {searched.length}
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onStatusFilter(statusFilter === s ? "all" : s)}
            className={`${pillBase} ${STATUS_PILL[s]} ${
              statusFilter === s ? "ring-2 ring-blue-500/70" : ""
            }`}
          >
            {STATUS_LABEL[s]} {statusCounts[s]}
          </button>
        ))}
      </div>

      {/* Kind filter */}
      <div className="mt-2 flex gap-1">
        {(
          [
            ["all", "Everyone"],
            ["kids", "Kids"],
            ["adults", "Adults"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => onKindFilter(k)}
            className={`${pillBase} ${
              kindFilter === k
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
        Going {totals.yes} · Opened {totals.opened} · Invited {totals.invited} · Planning{" "}
        {totals.planning} · Out {totals.no}
      </p>

      {/* Groups */}
      {groups.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          No people match. Add some below.
        </p>
      )}
      {groups.map((g) => (
        <div key={g.label} className="mt-3">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {g.label} · {g.list.length}
          </p>
          <div className="space-y-1">
            {g.list.map((p) => {
              const myPicks = picks.filter((pk) => pk.fromPersonId === p.id);
              const pickTargets = people.filter(
                (o) => isKid(o) && o.id !== p.id && !myPicks.some((pk) => pk.toPersonId === o.id)
              );
              return (
                <div key={p.id}>
                  <div className="relative flex items-center gap-1.5">
                    <PersonChip
                      person={p}
                      variant="row"
                      selected={p.id === selectedPersonId}
                      onPointerDown={(e) => onChipPointerDown(p, e)}
                    />
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_PILL[p.status]}`}
                      title={
                        p.statusSource === "manual" ? "Status set manually" : `Status: ${p.status}`
                      }
                    >
                      {STATUS_LABEL[p.status]}
                      {p.statusSource === "manual" && " ✎"}
                    </span>
                    {p.rsvpNote && (
                      <span
                        className="shrink-0 text-amber-500"
                        title={p.rsvpNote}
                        aria-label={p.rsvpNote}
                      >
                        ●
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}
                      className="shrink-0 rounded-md px-1 py-0.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300"
                      aria-label={`Actions for ${p.displayName}`}
                    >
                      ⋯
                    </button>

                    {menuFor === p.id && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setMenuFor(null)} />
                        <div className="absolute right-0 top-8 z-40 w-48 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-1 shadow-xl">
                          <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                            Mark as…
                          </p>
                          {STATUSES.map((s) =>
                            menuItem(
                              `${STATUS_LABEL[s]}${p.manualStatus === s ? " ✓" : ""}`,
                              () => onSetStatus(p.id, s)
                            )
                          )}
                          {p.manualStatus != null &&
                            menuItem("Clear override", () => onSetStatus(p.id, null))}
                          <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                          {menuItem(p.locked ? "Unlock" : "Lock in place", () => onToggleLock(p))}
                          {(p.seatId || p.inSro) && menuItem("Unassign", () => onUnassign(p))}
                          {isKid(p) &&
                            menuItem("Sit-by picks…", () => setPicksFor(picksFor === p.id ? null : p.id))}
                          <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                          {menuItem("Remove from plan", () => onRemove(p), true)}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Inline sit-by picks editor */}
                  {picksFor === p.id && (
                    <div className="mt-1 ml-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                          Wants to sit by
                        </p>
                        <button
                          type="button"
                          onClick={() => setPicksFor(null)}
                          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          close
                        </button>
                      </div>
                      {myPicks.length === 0 && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          No picks yet.
                        </p>
                      )}
                      <div className="mt-1 space-y-1">
                        {myPicks.map((pk) => (
                          <div key={pk.id} className="flex items-center gap-1.5 text-sm">
                            <span className="min-w-0 flex-1 truncate text-gray-800 dark:text-gray-200">
                              {byId.get(pk.toPersonId)?.displayName ?? "Unknown"}
                            </span>
                            {pk.source === "event" ? (
                              <span className="rounded-full bg-gray-200 dark:bg-gray-700 px-1.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                                RSVP
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onRemovePick(pk.id)}
                                className="text-xs text-gray-400 hover:text-red-600"
                                aria-label="Remove pick"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {pickTargets.length > 0 && (
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) onAddPick(p.id, e.target.value);
                            e.currentTarget.value = "";
                          }}
                          className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-300"
                          aria-label="Add a sit-by pick"
                        >
                          <option value="">＋ add a kid…</option>
                          {pickTargets.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.displayName}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Footer actions */}
      <div className="mt-4 space-y-1.5 border-t border-gray-100 dark:border-gray-800 pt-3">
        <button
          type="button"
          onClick={onOpenAdd}
          className="w-full rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + Add people
        </button>
        <button type="button" onClick={onAddGuest} className={footerBtn}>
          + Guest
        </button>
        {eventLinked && (
          <>
            <button type="button" onClick={onSyncRsvps} className={footerBtn}>
              Pull from RSVPs{unmatchedRsvpCount > 0 ? ` (${unmatchedRsvpCount} new)` : ""}
            </button>
            <button
              type="button"
              onClick={() => onInvite(inviteIds)}
              className={footerBtn}
              title="Invites everyone with Planning status in the current filter"
            >
              Invite selected… ({inviteIds.length})
            </button>
          </>
        )}
      </div>
    </div>
  );
}
