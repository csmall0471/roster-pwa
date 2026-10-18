"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AssignInput,
  DerivedStatus,
  PersonVM,
  PlanData,
  SeatVM,
  ZoneVM,
} from "../types";
import {
  VIRTUAL_W,
  VIRTUAL_H,
  SEAT,
  SNAP,
  clusterSeats,
  seatWorldCenters,
} from "../layout-seed";
import { autoAssign } from "../assign";
import {
  linkEvent,
  setCollectSitBy,
  addPeopleFromTeams,
  addGuest,
  removePerson,
  removePeople,
  setManualStatus,
  setLocked,
  assignSeat,
  setInSro,
  swapSeats,
  applyAssignments,
  clearUnlockedAssignments,
  moveZone,
  addZone,
  deleteZone,
  addSeat,
  updateSeat,
  deleteSeat,
  addAdminPick,
  removeAdminPick,
  syncPeopleFromEvent,
  invitePeople,
  resetLayoutToSeed,
  clearAllAssignments,
  restoreAssignments,
} from "../actions";
import SeatMap, { type SeatMapApi } from "./SeatMap";
import Toolbar, { type AddKind } from "./Toolbar";
import PeoplePanel, { type KindFilter, type StatusFilter } from "./PeoplePanel";
import AddPeopleModal, { type PlayerOption, type TeamOption } from "./AddPeopleModal";
import LinkEventModal, { type EventOption } from "./LinkEventModal";

type Mode = "assign" | "edit";

// ── Pure plan-patch helpers ───────────────────────────────────────────────────

const patchPerson = (p: PlanData, id: string, patch: Partial<PersonVM>): PlanData => ({
  ...p,
  people: p.people.map((x) => (x.id === id ? { ...x, ...patch } : x)),
});
const patchZone = (p: PlanData, id: string, patch: Partial<ZoneVM>): PlanData => ({
  ...p,
  zones: p.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)),
});
const patchSeat = (p: PlanData, id: string, patch: Partial<SeatVM>): PlanData => ({
  ...p,
  seats: p.seats.map((s) => (s.id === id ? { ...s, ...patch } : s)),
});

// A freshly-added guest, before the server round-trip fills in derived fields.
const guestVM = (id: string, name: string): PersonVM => ({
  id,
  kind: "guest",
  displayName: name,
  playerId: null,
  parentId: null,
  sourceTeamId: null,
  manualStatus: null,
  seatId: null,
  inSro: false,
  locked: false,
  status: "planning",
  statusSource: "none",
  familyKey: null,
  teamIds: [],
  age: null,
  rsvpNote: null,
});

const snapTo = (v: number) => Math.round(v / SNAP) * SNAP;

export default function SeatingTool({
  data,
  teams,
  allPlayers,
  events,
}: {
  data: PlanData;
  teams: TeamOption[];
  allPlayers: PlayerOption[];
  events: EventOption[];
}) {
  const router = useRouter();
  const planId = data.plan.id;

  // Authoritative client copy; re-synced whenever the server sends fresh data
  // (router.refresh → new prop identity). useState initializers only run on
  // mount, so reset during render when the prop identity changes — the
  // React-recommended alternative to a syncing effect (same as TeamsBoard).
  const [plan, setPlan] = useState<PlanData>(data);
  const [lastData, setLastData] = useState(data);
  if (lastData !== data) {
    setLastData(data);
    setPlan(data);
  }
  const planRef = useRef(plan);
  useEffect(() => {
    planRef.current = plan;
  }, [plan]);

  const [mode, setModeState] = useState<Mode>("assign");
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [assignSeed, setAssignSeed] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const mapApi = useRef<SeatMapApi | null>(null);

  function setMode(m: Mode) {
    setModeState(m);
    setSelectedPersonId(null);
    setSelectedZoneId(null);
    setSelectedSeatId(null);
  }

  // ── Toast ───────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Optimistic mutation: apply locally, run the action, revert + toast on error.
  const act = useCallback(
    async <T extends { error?: string }>(
      apply: ((p: PlanData) => PlanData) | null,
      call: () => Promise<T>
    ): Promise<T> => {
      const prev = planRef.current;
      if (apply) setPlan(apply(prev));
      try {
        const res = await call();
        if (res?.error) {
          if (apply) setPlan(prev);
          showToast(res.error);
        }
        return res;
      } catch (e) {
        if (apply) setPlan(prev);
        const msg = e instanceof Error ? e.message : "Something went wrong";
        showToast(msg);
        return { error: msg } as T;
      }
    },
    [showToast]
  );

  // ── Derived ─────────────────────────────────────────────────────────────────
  const occupantBySeat = useMemo(() => {
    const m = new Map<string, PersonVM>();
    for (const p of plan.people) if (p.seatId) m.set(p.seatId, p);
    return m;
  }, [plan.people]);
  const seated = useMemo(() => plan.people.filter((p) => p.seatId).length, [plan.people]);
  const seatsAvailable = useMemo(
    () => plan.seats.filter((s) => !s.unavailable).length,
    [plan.seats]
  );
  const sroZone = useMemo(() => plan.zones.find((z) => z.kind === "sro") ?? null, [plan.zones]);
  const sroCount = useMemo(() => plan.people.filter((p) => p.inSro).length, [plan.people]);

  // Layout predating the venue-true seed: BL1–BL12 are 2×4 sections (≤4 seats
  // means the old geometry), and BL6 belongs on the FLAT run next to BL7 (a
  // rotated BL6 is the older diagonal placement). Surface a reset banner
  // instead of leaving the plan stale.
  const staleLayout = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of plan.seats) {
      if (s.zoneId) counts.set(s.zoneId, (counts.get(s.zoneId) ?? 0) + 1);
    }
    return plan.zones.some(
      (z) =>
        z.kind === "cluster" &&
        ((/^BL([1-9]|1[0-2])$/i.test(z.label.trim()) && (counts.get(z.id) ?? 0) <= 4) ||
          (/^BL6$/i.test(z.label.trim()) && z.rotation !== 0))
    );
  }, [plan.zones, plan.seats]);

  // ── Undo / redo (assignment changes only) ───────────────────────────────────
  // Each mutation snapshots everyone's {seatId, inSro} BEFORE applying; undo
  // restores that exact state (locked included) via restoreAssignments.

  type AssignSnapshot = Map<string, { seatId: string | null; inSro: boolean }>;
  const undoStack = useRef<AssignSnapshot[]>([]);
  const redoStack = useRef<AssignSnapshot[]>([]);
  // Stack sizes mirrored into state so the toolbar's disabled flags render
  // without reading refs during render.
  const [histSize, setHistSize] = useState({ undo: 0, redo: 0 });
  const syncHist = () =>
    setHistSize({ undo: undoStack.current.length, redo: redoStack.current.length });

  const snapshotAssignments = (): AssignSnapshot =>
    new Map(plan.people.map((p) => [p.id, { seatId: p.seatId, inSro: p.inSro }]));

  function pushHistory() {
    undoStack.current.push(snapshotAssignments());
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
    syncHist();
  }

  function applyAssignmentSnapshot(snap: AssignSnapshot) {
    void act(
      (p) => ({
        ...p,
        people: p.people.map((x) => {
          const s = snap.get(x.id);
          return s ? { ...x, seatId: s.seatId, inSro: s.inSro } : x;
        }),
      }),
      () =>
        restoreAssignments(
          planId,
          [...snap.entries()].map(([personId, s]) => ({
            personId,
            seatId: s.seatId,
            inSro: s.inSro,
          }))
        )
    );
  }

  function handleUndo() {
    const snap = undoStack.current.pop();
    if (!snap) return;
    redoStack.current.push(snapshotAssignments());
    syncHist();
    applyAssignmentSnapshot(snap);
  }

  function handleRedo() {
    const snap = redoStack.current.pop();
    if (!snap) return;
    undoStack.current.push(snapshotAssignments());
    syncHist();
    applyAssignmentSnapshot(snap);
  }

  function handleClearAll() {
    if (
      !window.confirm(
        "Unassign EVERY seat (locked ones too)? Standing-room stays. You can Undo this."
      )
    )
      return;
    pushHistory();
    void act(
      (p) => ({
        ...p,
        people: p.people.map((x) => (x.seatId ? { ...x, seatId: null } : x)),
      }),
      () => clearAllAssignments(planId)
    );
  }

  // Cmd/Ctrl+Z undo, Shift+Cmd/Ctrl+Z redo — skipped while typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const t = e.target as HTMLElement | null;
      if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
      e.preventDefault();
      if (e.shiftKey) handleRedo();
      else handleUndo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── Assign-mode mutations ───────────────────────────────────────────────────

  function handleAssign(personId: string, seatId: string) {
    pushHistory();
    void act(
      (p) => patchPerson(p, personId, { seatId, inSro: false }),
      () => assignSeat(planId, personId, seatId)
    );
  }

  function handleSwap(aId: string, bId: string) {
    pushHistory();
    void act((p) => {
      const a = p.people.find((x) => x.id === aId);
      const b = p.people.find((x) => x.id === bId);
      if (!a || !b) return p;
      return {
        ...p,
        people: p.people.map((x) =>
          x.id === aId
            ? { ...x, seatId: b.seatId, inSro: false }
            : x.id === bId
              ? { ...x, seatId: a.seatId, inSro: false }
              : x
        ),
      };
    }, () => swapSeats(planId, aId, bId));
  }

  function handleSro(personId: string) {
    pushHistory();
    void act(
      (p) => patchPerson(p, personId, { inSro: true, seatId: null }),
      () => setInSro(planId, personId, true)
    );
  }

  function handleUnassign(person: PersonVM) {
    if (!person.seatId && !person.inSro) return;
    pushHistory();
    if (person.seatId) {
      void act(
        (p) => patchPerson(p, person.id, { seatId: null }),
        () => assignSeat(planId, person.id, null)
      );
    } else if (person.inSro) {
      void act(
        (p) => patchPerson(p, person.id, { inSro: false }),
        () => setInSro(planId, person.id, false)
      );
    }
  }

  // ── People management ───────────────────────────────────────────────────────

  function handleSetStatus(personId: string, status: DerivedStatus | null) {
    void act(
      (p) => {
        const person = p.people.find((x) => x.id === personId);
        if (!person) return p;
        return patchPerson(p, personId, {
          manualStatus: status,
          // Clearing the override re-derives from the event — only the server
          // knows that, so keep the current status and refresh below.
          status: status ?? person.status,
          statusSource: status ? "manual" : "none",
        });
      },
      () => setManualStatus(planId, personId, status)
    ).then((res) => {
      if (!res.error && status === null) router.refresh();
    });
  }

  function handleToggleLock(person: PersonVM) {
    void act(
      (p) => patchPerson(p, person.id, { locked: !person.locked }),
      () => setLocked(planId, person.id, !person.locked)
    );
  }

  function handleRemove(person: PersonVM) {
    if (!window.confirm(`Remove ${person.displayName} from this plan?`)) return;
    if (selectedPersonId === person.id) setSelectedPersonId(null);
    void act(
      (p) => ({
        ...p,
        people: p.people.filter((x) => x.id !== person.id),
        picks: p.picks.filter(
          (pk) => pk.fromPersonId !== person.id && pk.toPersonId !== person.id
        ),
      }),
      () => removePerson(planId, person.id)
    );
  }

  // Remove a whole household (family group ✕). ids is the FULL family, not
  // just the rows visible under the current filters.
  function handleRemoveFamily(ids: string[], label: string) {
    const idSet = new Set(ids);
    const names = plan.people.filter((p) => idSet.has(p.id)).map((p) => p.displayName);
    if (names.length === 0) return;
    const msg =
      `Remove the ${label} (${names.length} ${names.length === 1 ? "person" : "people"}) from this plan?\n\n` +
      names.join(", ");
    if (!window.confirm(msg)) return;
    if (selectedPersonId && idSet.has(selectedPersonId)) setSelectedPersonId(null);
    void act(
      (p) => ({
        ...p,
        people: p.people.filter((x) => !idSet.has(x.id)),
        picks: p.picks.filter(
          (pk) => !idSet.has(pk.fromPersonId) && !idSet.has(pk.toPersonId)
        ),
      }),
      () => removePeople(planId, ids)
    );
  }

  function handleAddPick(fromPersonId: string, toPersonId: string) {
    const tempId = `tmp-${Date.now()}`;
    void act(
      (p) => ({
        ...p,
        picks: [...p.picks, { id: tempId, fromPersonId, toPersonId, source: "admin" as const }],
      }),
      () => addAdminPick(planId, fromPersonId, toPersonId)
    ).then((res) => {
      if (!res.error) router.refresh(); // swap the temp id for the real one
    });
  }

  function handleRemovePick(pickId: string) {
    if (pickId.startsWith("tmp-")) {
      router.refresh();
      return;
    }
    void act(
      (p) => ({ ...p, picks: p.picks.filter((pk) => pk.id !== pickId) }),
      () => removeAdminPick(planId, pickId)
    );
  }

  function handleAddGuest() {
    const name = window.prompt("Guest name?");
    if (!name?.trim()) return;
    void addGuest(planId, name.trim(), "guest").then((res) => {
      if (res.error) {
        showToast(res.error);
        return;
      }
      if (res.id) {
        const id = res.id;
        setPlan((p) => ({ ...p, people: [...p.people, guestVM(id, name.trim())] }));
      }
      showToast(`Added ${name.trim()}`);
      router.refresh();
    });
  }

  async function handleAddPeople(input: {
    teamIds: string[];
    playerIds: string[];
    includeParents: boolean;
    includeSiblings: boolean;
  }) {
    const res = await addPeopleFromTeams(planId, input);
    if (res.error) {
      showToast(res.error);
      return;
    }
    showToast(`Added ${res.added ?? 0} people`);
    setAddOpen(false);
    router.refresh();
  }

  // ── Event link / RSVP flows ─────────────────────────────────────────────────

  async function handlePickEvent(eventId: string) {
    const res = await linkEvent(planId, eventId);
    if (res.error) {
      showToast(res.error);
      return;
    }
    const ev = events.find((e) => e.id === eventId);
    setPlan((p) => ({
      ...p,
      plan: { ...p.plan, eventId },
      event: ev
        ? {
            id: ev.id,
            title: ev.title,
            slug: ev.slug,
            status: ev.status,
            collectSitBy: false,
            startsAt: ev.starts_at,
          }
        : p.event,
    }));
    setLinkOpen(false);
    showToast("Event linked");
    router.refresh();
  }

  function handleUnlink() {
    if (!window.confirm("Unlink this event? RSVP statuses will stop syncing.")) return;
    void act(
      (p) => ({ ...p, plan: { ...p.plan, eventId: null }, event: null, unmatchedRsvpCount: 0 }),
      () => linkEvent(planId, null)
    );
  }

  function handleToggleCollect(on: boolean) {
    const ev = planRef.current.event;
    if (!ev) return;
    void act(
      (p) => (p.event ? { ...p, event: { ...p.event, collectSitBy: on } } : p),
      () => setCollectSitBy(ev.id, on)
    );
  }

  function handleSyncRsvps() {
    void syncPeopleFromEvent(planId).then((res) => {
      if (res.error) {
        showToast(res.error);
        return;
      }
      showToast(`Added ${res.added ?? 0} from RSVPs`);
      router.refresh();
    });
  }

  async function handleInvite(personIds: string[]) {
    if (personIds.length === 0) {
      showToast("No planning-status people in the current filter");
      return;
    }
    const n = personIds.length;
    if (!window.confirm(`Send invites to ${n} ${n === 1 ? "person" : "people"}?`)) return;
    const prev = planRef.current;
    setPlan((p) => ({
      ...p,
      people: p.people.map((x) =>
        personIds.includes(x.id) && x.status === "planning"
          ? { ...x, status: "invited" as const }
          : x
      ),
    }));
    const res = await invitePeople(planId, personIds);
    if (res.error) {
      setPlan(prev);
      showToast(res.error);
      return;
    }
    showToast(`Sent ${res.sent ?? n} invites`);
    router.refresh();
  }

  // ── Auto-assign ─────────────────────────────────────────────────────────────

  function runAutoAssign(scope: "unassigned" | "all") {
    pushHistory();
    const p = planRef.current;
    // Kids only (players + siblings), not out, not locked, not deliberately
    // standing in SRO. "unassigned" additionally skips anyone already seated.
    const kids = p.people.filter(
      (x) =>
        (x.kind === "player" || x.kind === "sibling") &&
        x.status !== "no" &&
        !x.locked &&
        !x.inSro &&
        (scope === "all" || x.seatId == null)
    );
    if (kids.length === 0) {
      showToast("No kids to place");
      return;
    }
    const ids = new Set(kids.map((k) => k.id));
    const occ = new Map<string, string>(); // seatId → personId
    for (const x of p.people) if (x.seatId) occ.set(x.seatId, x.id);
    const centers = seatWorldCenters(p.zones, p.seats);
    // Assignable = available and either empty, or held by an unlocked kid who
    // is being re-placed in this run.
    const seats = p.seats
      .filter((s) => !s.unavailable)
      .filter((s) => {
        const holder = occ.get(s.id);
        return !holder || ids.has(holder);
      })
      .map((s) => {
        const c = centers.get(s.id);
        return { id: s.id, zoneId: s.zoneId, cx: c?.cx ?? 0, cy: c?.cy ?? 0 };
      });
    const input: AssignInput = {
      seats,
      people: kids.map((k) => ({ personId: k.id, familyKey: k.familyKey, teamIds: k.teamIds })),
      pickEdges: p.picks.map((pk) => ({ from: pk.fromPersonId, to: pk.toPersonId })),
      zoneOrder: p.zones
        .filter((z) => z.kind === "cluster")
        .sort((a, b) => a.position - b.position)
        .map((z) => z.id),
    };
    const seed = scope === "all" ? assignSeed + 1 : assignSeed;
    if (scope === "all") setAssignSeed(seed);
    const result = autoAssign(input, seed);

    const rows = kids.map((k) => ({
      personId: k.id,
      seatId: result.seatByPerson[k.id] ?? null,
      inSro: false,
    }));
    const prev = planRef.current;
    setPlan((pp) => ({
      ...pp,
      people: pp.people.map((x) =>
        ids.has(x.id) ? { ...x, seatId: result.seatByPerson[x.id] ?? null, inSro: false } : x
      ),
    }));
    void applyAssignments(planId, rows).then((res) => {
      if (res.error) {
        setPlan(prev);
        showToast(res.error);
        return;
      }
      const placed = Object.keys(result.seatByPerson).length;
      showToast(
        `Placed ${placed} kids · ${result.satisfiedPicks}/${result.totalPicks} picks satisfied · ${result.unplaced.length} unplaced`
      );
    });
  }

  function handleClearUnlocked() {
    if (!window.confirm("Clear every unlocked seat assignment? (Standing-room stays put.)")) return;
    pushHistory();
    // Matches the server: only seat_id clears; in_sro is left alone so parents
    // stay standing.
    void act(
      (p) => ({
        ...p,
        people: p.people.map((x) => (x.locked || !x.seatId ? x : { ...x, seatId: null })),
      }),
      () => clearUnlockedAssignments(planId)
    );
  }

  // ── Layout editing ──────────────────────────────────────────────────────────

  function previewZone(zoneId: string, x: number, y: number) {
    setPlan((p) => patchZone(p, zoneId, { x, y }));
  }
  function commitZoneMove(zoneId: string, x: number, y: number, origX: number, origY: number) {
    setPlan((p) => patchZone(p, zoneId, { x, y }));
    void moveZone(planId, zoneId, { x, y }).then((res) => {
      if (res.error) {
        setPlan((p) => patchZone(p, zoneId, { x: origX, y: origY }));
        showToast(res.error);
      }
    });
  }
  function previewSeat(seatId: string, x: number, y: number) {
    setPlan((p) => patchSeat(p, seatId, { x, y }));
  }
  function commitSeatMove(seatId: string, x: number, y: number, origX: number, origY: number) {
    setPlan((p) => patchSeat(p, seatId, { x, y }));
    void updateSeat(planId, seatId, { x, y }).then((res) => {
      if (res.error) {
        setPlan((p) => patchSeat(p, seatId, { x: origX, y: origY }));
        showToast(res.error);
      }
    });
  }

  function handleRotateZone(zone: ZoneVM) {
    const rotation = (zone.rotation + 45) % 360;
    void act(
      (p) => patchZone(p, zone.id, { rotation }),
      () => moveZone(planId, zone.id, { rotation })
    );
  }

  function handleRenameZone(zone: ZoneVM) {
    const label = window.prompt("Zone label", zone.label);
    if (label == null) return;
    void act(
      (p) => patchZone(p, zone.id, { label: label.trim() }),
      () => moveZone(planId, zone.id, { label: label.trim() })
    );
  }

  function handleZoneCapacity(zone: ZoneVM) {
    const raw = window.prompt(
      "Standing-room capacity (blank for none)",
      zone.capacity != null ? String(zone.capacity) : ""
    );
    if (raw == null) return;
    const capacity = raw.trim() === "" ? null : Number.parseInt(raw, 10);
    if (capacity != null && !Number.isFinite(capacity)) {
      showToast("Enter a whole number");
      return;
    }
    void act(
      (p) => patchZone(p, zone.id, { capacity }),
      () => moveZone(planId, zone.id, { capacity })
    );
  }

  function handleDeleteZone(zone: ZoneVM) {
    const what = zone.kind === "cluster" ? " and its seats" : "";
    if (!window.confirm(`Delete ${zone.label || "this zone"}${what}?`)) return;
    setSelectedZoneId(null);
    void act(
      (p) => {
        const seatIds = new Set(p.seats.filter((s) => s.zoneId === zone.id).map((s) => s.id));
        return {
          ...p,
          zones: p.zones.filter((z) => z.id !== zone.id),
          seats: p.seats.filter((s) => s.zoneId !== zone.id),
          people: p.people.map((x) =>
            x.seatId && seatIds.has(x.seatId)
              ? { ...x, seatId: null }
              : zone.kind === "sro" && x.inSro
                ? { ...x, inSro: false }
                : x
          ),
        };
      },
      () => deleteZone(planId, zone.id)
    );
  }

  function handleToggleSeatAvailable(seat: SeatVM) {
    const unavailable = !seat.unavailable;
    void act(
      (p) => patchSeat(p, seat.id, { unavailable }),
      () => updateSeat(planId, seat.id, { unavailable })
    );
  }

  function handleRelabelSeat(seat: SeatVM) {
    const label = window.prompt("Seat label", seat.label);
    if (label == null || !label.trim()) return;
    void act(
      (p) => patchSeat(p, seat.id, { label: label.trim() }),
      () => updateSeat(planId, seat.id, { label: label.trim() })
    );
  }

  function handleDeleteSeat(seat: SeatVM) {
    if (!window.confirm(`Delete seat ${seat.label}?`)) return;
    setSelectedSeatId(null);
    void act(
      (p) => ({
        ...p,
        seats: p.seats.filter((s) => s.id !== seat.id),
        people: p.people.map((x) => (x.seatId === seat.id ? { ...x, seatId: null } : x)),
      }),
      () => deleteSeat(planId, seat.id)
    );
  }

  const afterCreate = (msg: string) => (res: { error?: string }) => {
    if (res.error) showToast(res.error);
    else {
      showToast(msg);
      router.refresh(); // pull the new row (we don't have its id locally)
    }
  };

  function handleAdd(kind: AddKind) {
    const c = mapApi.current?.getCenterWorld() ?? { x: VIRTUAL_W / 2, y: VIRTUAL_H / 2 };
    if (kind === "seat") {
      const label = window.prompt("Seat label", `S${plan.seats.length + 1}`);
      if (label == null || !label.trim()) return;
      void addSeat(planId, null, snapTo(c.x - SEAT / 2), snapTo(c.y - SEAT / 2), label.trim()).then(
        afterCreate("Seat added")
      );
      return;
    }
    if (kind === "2x4" || kind === "2x2" || kind === "1x4") {
      const label = window.prompt("Section label (e.g. BL16)", "");
      if (label == null || !label.trim()) return;
      const grid = clusterSeats(kind);
      void addZone(planId, {
        kind: "cluster",
        label: label.trim(),
        x: snapTo(c.x - grid.w / 2),
        y: snapTo(c.y - grid.h / 2),
        shape: kind,
        capacity: null,
      }).then(afterCreate("Section added"));
      return;
    }
    if (kind === "table") {
      void addZone(planId, {
        kind: "table",
        label: "",
        x: snapTo(c.x - 70),
        y: snapTo(c.y - 70),
        capacity: null,
      }).then(afterCreate("Table added"));
      return;
    }
    if (kind === "bar") {
      // Server creates bars at 420×110.
      void addZone(planId, {
        kind: "bar",
        label: "BAR",
        x: snapTo(c.x - 210),
        y: snapTo(c.y - 55),
        capacity: null,
      }).then(afterCreate("Bar added"));
      return;
    }
    const raw = window.prompt("Standing-room capacity", "52");
    if (raw == null) return;
    const cap = Number.parseInt(raw, 10);
    // Server creates SRO zones at 600×400 — center that footprint on the view.
    void addZone(planId, {
      kind: "sro",
      label: "Standing Room",
      x: snapTo(c.x - 300),
      y: snapTo(c.y - 200),
      capacity: Number.isFinite(cap) ? cap : null,
    }).then(afterCreate("SRO zone added"));
  }

  function handleResetLayout() {
    if (
      !window.confirm(
        "Replace the whole layout with the seeded Hideaway Lounge (real ticket inventory)? People stay, but every seat assignment clears."
      )
    )
      return;
    void resetLayoutToSeed(planId).then((res) => {
      if (res.error) {
        showToast(res.error);
        return;
      }
      showToast("Layout reset to the seeded lounge");
      router.refresh();
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="lg:grid lg:grid-cols-[minmax(260px,320px)_1fr] lg:gap-4">
      {/* People sidebar (collapsible on mobile) */}
      <div className="mb-3 lg:mb-0">
        <button
          type="button"
          onClick={() => setPanelOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-semibold text-gray-900 dark:text-white lg:hidden"
        >
          People ({plan.people.length})
          <span className="text-gray-400">{panelOpen ? "▾" : "▸"}</span>
        </button>
        <div className={`${panelOpen ? "mt-2" : "hidden"} lg:mt-0 lg:block`}>
          <PeoplePanel
            people={plan.people}
            picks={plan.picks}
            teamNames={plan.teamNames}
            selectedPersonId={selectedPersonId}
            search={search}
            onSearch={setSearch}
            statusFilter={statusFilter}
            onStatusFilter={setStatusFilter}
            kindFilter={kindFilter}
            onKindFilter={setKindFilter}
            eventLinked={plan.event != null}
            unmatchedRsvpCount={plan.unmatchedRsvpCount}
            onChipPointerDown={(p, e) => mapApi.current?.chipPointerDown(p, e)}
            onSetStatus={handleSetStatus}
            onToggleLock={handleToggleLock}
            onUnassign={handleUnassign}
            onRemove={handleRemove}
            onRemoveFamily={handleRemoveFamily}
            onAddPick={handleAddPick}
            onRemovePick={handleRemovePick}
            onOpenAdd={() => setAddOpen(true)}
            onAddGuest={handleAddGuest}
            onSyncRsvps={handleSyncRsvps}
            onInvite={handleInvite}
          />
        </div>
      </div>

      {/* Toolbar + map */}
      <div className="min-w-0">
        {staleLayout && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2">
            <span className="text-sm text-amber-800 dark:text-amber-300">
              This plan&apos;s layout predates the venue-true model (BL1–BL12 are 2-row sections
              with your real ticket inventory).
            </span>
            <button
              type="button"
              onClick={handleResetLayout}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
            >
              ↺ Reset layout now
            </button>
          </div>
        )}
        <Toolbar
          mode={mode}
          onMode={setMode}
          onZoomIn={() => mapApi.current?.zoomIn()}
          onZoomOut={() => mapApi.current?.zoomOut()}
          onFit={() => mapApi.current?.fit()}
          seated={seated}
          seatsAvailable={seatsAvailable}
          sro={sroCount}
          sroCap={sroZone?.capacity ?? null}
          onPlaceUnassigned={() => runAutoAssign("unassigned")}
          onRerun={() => runAutoAssign("all")}
          onClearUnlocked={handleClearUnlocked}
          event={plan.event}
          onToggleCollect={handleToggleCollect}
          onUnlink={handleUnlink}
          onOpenLink={() => setLinkOpen(true)}
          onAdd={handleAdd}
          onResetLayout={handleResetLayout}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={histSize.undo > 0}
          canRedo={histSize.redo > 0}
          onClearAll={handleClearAll}
        />
        <SeatMap
          mode={mode}
          picks={plan.picks}
          teamNames={plan.teamNames}
          zones={plan.zones}
          seats={plan.seats}
          people={plan.people}
          occupantBySeat={occupantBySeat}
          selectedPersonId={selectedPersonId}
          selectedZoneId={selectedZoneId}
          selectedSeatId={selectedSeatId}
          apiRef={mapApi}
          onSelectPerson={setSelectedPersonId}
          onSelectZone={setSelectedZoneId}
          onSelectSeat={setSelectedSeatId}
          onAssign={handleAssign}
          onSwap={handleSwap}
          onSro={handleSro}
          onZonePreview={previewZone}
          onZoneCommit={commitZoneMove}
          onSeatPreview={previewSeat}
          onSeatCommit={commitSeatMove}
          onRotateZone={handleRotateZone}
          onRenameZone={handleRenameZone}
          onZoneCapacity={handleZoneCapacity}
          onDeleteZone={handleDeleteZone}
          onToggleSeatAvailable={handleToggleSeatAvailable}
          onRelabelSeat={handleRelabelSeat}
          onDeleteSeat={handleDeleteSeat}
        />
      </div>

      {/* Modals */}
      {addOpen && (
        <AddPeopleModal
          teams={teams}
          allPlayers={allPlayers}
          onClose={() => setAddOpen(false)}
          onSubmit={handleAddPeople}
        />
      )}
      {linkOpen && (
        <LinkEventModal
          events={events}
          currentEventId={plan.plan.eventId}
          onClose={() => setLinkOpen(false)}
          onPick={handlePickEvent}
          onUnlink={() => {
            setLinkOpen(false);
            handleUnlink();
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-lg dark:bg-white dark:text-gray-900">
          {toast}
        </div>
      )}
    </div>
  );
}
