"use client";

import { useState, useMemo, useTransition } from "react";
import type { TeamWithRoster, InterestEntry, InterestList, PlayerContact } from "../page";
import MessageComposer from "../../players/_components/MessageComposer";
import InterestPlayerPicker from "./InterestPlayerPicker";
import {
  addInterestEntry,
  deleteInterestEntry,
  createInterestList,
  renameInterestList,
  deleteInterestList,
  addPlayersToInterestList,
} from "../actions";

type Recipient = { name: string; email: string | null; phone: string | null };

function uniqueParents(teams: TeamWithRoster[]): Recipient[] {
  const seen = new Set<string>();
  const result: Recipient[] = [];
  for (const team of teams) {
    for (const r of team.roster ?? []) {
      for (const pp of r.players?.player_parents ?? []) {
        const par = pp.parents;
        if (!par || seen.has(par.id)) continue;
        seen.add(par.id);
        result.push({ name: `${par.first_name} ${par.last_name}`, email: par.email, phone: par.phone });
      }
    }
  }
  return result;
}

// Legacy pseudo-list for entries created before named lists existed
// (list_id IS NULL). Shown only when such rows exist.
const UNSORTED = "__unsorted";

export default function EmailHub({
  teams,
  interestEntries: initialEntries,
  interestLists: initialLists,
  playerContacts,
}: {
  teams: TeamWithRoster[];
  interestEntries: InterestEntry[];
  interestLists: InterestList[];
  playerContacts: Record<string, PlayerContact>;
}) {
  const [tab, setTab] = useState<"groups" | "interest">("groups");

  // ── Team groups state ──────────────────────────────────────────
  const [filterOrg, setFilterOrg]       = useState<string>("all");
  const [filterSport, setFilterSport]   = useState<string>("all");
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [composer, setComposer]         = useState<{ recipients: Recipient[]; context: string } | null>(null);

  const orgs   = useMemo(() => [...new Set(teams.map(t => t.organization).filter(Boolean) as string[])].sort(), [teams]);
  const sports = useMemo(() => [...new Set(teams.map(t => t.sport).filter(Boolean) as string[])].sort(), [teams]);

  const visibleTeams = useMemo(() =>
    teams.filter(t =>
      (filterOrg   === "all" || t.organization === filterOrg) &&
      (filterSport === "all" || t.sport        === filterSport)
    ),
  [teams, filterOrg, filterSport]);

  function toggleTeam(id: string) {
    setSelectedTeams(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function selectAll() { setSelectedTeams(new Set(visibleTeams.map(t => t.id))); }
  function clearAll()  { setSelectedTeams(new Set()); }

  const selectedRecipients = useMemo(() => {
    const picked = teams.filter(t => selectedTeams.has(t.id));
    return uniqueParents(picked);
  }, [teams, selectedTeams]);

  // ── Interest list state ────────────────────────────────────────
  const [lists, setLists]       = useState<InterestList[]>(initialLists);
  const [entries, setEntries]   = useState<InterestEntry[]>(initialEntries);
  const hasUnsorted = useMemo(() => entries.some(e => !e.list_id), [entries]);
  const [activeListId, setActiveListId] = useState<string>(
    initialLists[0]?.id ?? (initialEntries.some(e => !e.list_id) ? UNSORTED : "")
  );
  const [addError, setAddError] = useState<string | null>(null);
  const [notice, setNotice]     = useState<string | null>(null);
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListSport, setNewListSport] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, startPending] = useTransition();

  const activeList = lists.find(l => l.id === activeListId) ?? null;
  const activeEntries = useMemo(
    () =>
      activeListId === UNSORTED
        ? entries.filter(e => !e.list_id)
        : entries.filter(e => e.list_id === activeListId),
    [entries, activeListId]
  );
  const countFor = (listId: string) =>
    listId === UNSORTED
      ? entries.filter(e => !e.list_id).length
      : entries.filter(e => e.list_id === listId).length;

  const activePlayerIds = useMemo(
    () => new Set(activeEntries.map(e => e.player_id).filter(Boolean) as string[]),
    [activeEntries]
  );

  // Compose recipients: manual contacts as themselves; player entries expand
  // to their parents (deduped by email across the whole list).
  const interestRecipients = useMemo(() => {
    const out: Recipient[] = [];
    const seenEmail = new Set<string>();
    const push = (r: Recipient) => {
      const key = r.email?.toLowerCase();
      if (!key || seenEmail.has(key)) return;
      seenEmail.add(key);
      out.push(r);
    };
    for (const e of activeEntries) {
      if (e.player_id) {
        for (const par of playerContacts[e.player_id]?.parents ?? []) {
          push({ name: par.name, email: par.email, phone: par.phone });
        }
      } else if (e.email) {
        push({ name: `${e.first_name} ${e.last_name}`.trim(), email: e.email, phone: e.phone });
      }
    }
    return out;
  }, [activeEntries, playerContacts]);

  async function handleCreateList() {
    setAddError(null);
    const result = await createInterestList(newListName, newListSport || null);
    if (result.error || !result.list) { setAddError(result.error ?? "Failed"); return; }
    setLists(prev => [...prev, result.list!].sort((a, b) => a.name.localeCompare(b.name)));
    setActiveListId(result.list.id);
    setNewListOpen(false);
    setNewListName("");
    setNewListSport("");
  }

  function handleRenameList() {
    if (!activeList) return;
    const name = window.prompt("Rename list", activeList.name)?.trim();
    if (!name || name === activeList.name) return;
    setLists(prev => prev.map(l => (l.id === activeList.id ? { ...l, name } : l)));
    startPending(async () => {
      const res = await renameInterestList(activeList.id, name);
      if (res.error) setAddError(res.error);
    });
  }

  function handleDeleteList() {
    if (!activeList) return;
    const n = countFor(activeList.id);
    if (!window.confirm(`Delete “${activeList.name}”${n ? ` and its ${n} entr${n === 1 ? "y" : "ies"}` : ""}?`)) return;
    const id = activeList.id;
    setLists(prev => prev.filter(l => l.id !== id));
    setEntries(prev => prev.filter(e => e.list_id !== id));
    setActiveListId(lists.find(l => l.id !== id)?.id ?? (hasUnsorted ? UNSORTED : ""));
    startPending(async () => {
      const res = await deleteInterestList(id);
      if (res.error) setAddError(res.error);
    });
  }

  async function handleAdd(formData: FormData) {
    setAddError(null);
    const result = await addInterestEntry(formData);
    if (result.error || !result.entry) { setAddError(result.error ?? "Failed"); return; }
    setEntries(prev => [...prev, result.entry!]);
  }

  function handleAddPlayers(playerIds: string[]) {
    if (!activeList) return;
    setAddError(null);
    startPending(async () => {
      const res = await addPlayersToInterestList(activeList.id, playerIds);
      if (res.error) { setAddError(res.error); return; }
      if (res.entries?.length) setEntries(prev => [...prev, ...res.entries!]);
      setPickerOpen(false);
      setNotice(
        `Added ${res.entries?.length ?? 0} player${(res.entries?.length ?? 0) === 1 ? "" : "s"}` +
          (res.skipped ? ` (${res.skipped} already in the list)` : "")
      );
      setTimeout(() => setNotice(null), 4000);
    });
  }

  function handleDelete(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id));
    startPending(async () => { await deleteInterestEntry(id); });
  }

  function emailInterestList() {
    const label = activeListId === UNSORTED ? "Interest List" : activeList?.name ?? "Interest List";
    setComposer({ recipients: interestRecipients, context: label });
  }

  const chipCls = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? "bg-blue-600 text-white"
        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
    }`;
  const inputCls =
    "w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white";

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Email</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        {(["groups", "interest"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
            }`}
          >
            {t === "groups" ? "Team Groups" : "Interest Lists"}
          </button>
        ))}
      </div>

      {/* ── Team Groups ───────────────────────────────────────── */}
      {tab === "groups" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Organization</label>
              <select
                value={filterOrg}
                onChange={e => { setFilterOrg(e.target.value); setSelectedTeams(new Set()); }}
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm px-3 py-1.5 text-gray-900 dark:text-white"
              >
                <option value="all">All orgs</option>
                {orgs.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Sport</label>
              <select
                value={filterSport}
                onChange={e => { setFilterSport(e.target.value); setSelectedTeams(new Set()); }}
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm px-3 py-1.5 text-gray-900 dark:text-white"
              >
                <option value="all">All sports</option>
                {sports.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Select all / clear */}
          <div className="flex items-center gap-3 text-xs">
            <button onClick={selectAll} className="text-blue-600 dark:text-blue-400 hover:underline">Select all ({visibleTeams.length})</button>
            {selectedTeams.size > 0 && <button onClick={clearAll} className="text-gray-400 hover:underline">Clear</button>}
          </div>

          {/* Team list */}
          <div className="divide-y divide-gray-100 dark:divide-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {visibleTeams.length === 0 && (
              <p className="px-4 py-8 text-sm text-gray-400 text-center">No teams match the filters.</p>
            )}
            {visibleTeams.map(team => (
              <label key={team.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <input
                  type="checkbox"
                  checked={selectedTeams.has(team.id)}
                  onChange={() => toggleTeam(team.id)}
                  className="rounded border-gray-300"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{team.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {[team.organization, team.sport, team.season].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </label>
            ))}
          </div>

          {/* Compose button */}
          {selectedTeams.size > 0 && (
            <div className="flex items-center gap-3 pt-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {selectedRecipients.filter(r => r.email).length} parent email{selectedRecipients.filter(r => r.email).length !== 1 ? "s" : ""}
                {" "}across {selectedTeams.size} team{selectedTeams.size !== 1 ? "s" : ""}
              </span>
              <button
                onClick={() => setComposer({
                  recipients: selectedRecipients,
                  context: `${selectedTeams.size} team${selectedTeams.size !== 1 ? "s" : ""}`,
                })}
                disabled={selectedRecipients.filter(r => r.email).length === 0}
                className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 disabled:opacity-40 transition-colors"
              >
                Compose email
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Interest Lists ────────────────────────────────────── */}
      {tab === "interest" && (
        <div className="space-y-5">
          {addError && (
            <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400 rounded px-2 py-1.5">{addError}</p>
          )}
          {notice && (
            <p className="text-xs text-green-700 bg-green-50 dark:bg-green-950 dark:text-green-400 rounded px-2 py-1.5">{notice}</p>
          )}

          {/* List chips + new list */}
          <div className="flex flex-wrap items-center gap-2">
            {lists.map(l => (
              <button key={l.id} onClick={() => setActiveListId(l.id)} className={chipCls(activeListId === l.id)}>
                {l.name}
                <span className={`ml-1.5 text-xs ${activeListId === l.id ? "text-blue-200" : "text-gray-400"}`}>
                  {countFor(l.id)}
                </span>
              </button>
            ))}
            {hasUnsorted && (
              <button onClick={() => setActiveListId(UNSORTED)} className={chipCls(activeListId === UNSORTED)}>
                Unsorted
                <span className={`ml-1.5 text-xs ${activeListId === UNSORTED ? "text-blue-200" : "text-gray-400"}`}>
                  {countFor(UNSORTED)}
                </span>
              </button>
            )}
            <button
              onClick={() => setNewListOpen(o => !o)}
              className="rounded-full border border-dashed border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600"
            >
              + New list
            </button>
          </div>

          {/* New list form */}
          {newListOpen && (
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
              <div className="min-w-44">
                <label className="block text-xs text-gray-500 mb-1">List name *</label>
                <input
                  autoFocus
                  value={newListName}
                  onChange={e => setNewListName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") void handleCreateList(); }}
                  placeholder="Spring 2027 Basketball"
                  className={inputCls}
                />
              </div>
              <div className="min-w-36">
                <label className="block text-xs text-gray-500 mb-1">Sport (optional)</label>
                <input
                  value={newListSport}
                  onChange={e => setNewListSport(e.target.value)}
                  placeholder="Basketball"
                  className={inputCls}
                />
              </div>
              <button
                onClick={() => void handleCreateList()}
                disabled={!newListName.trim()}
                className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 disabled:opacity-40"
              >
                Create list
              </button>
            </div>
          )}

          {lists.length === 0 && !hasUnsorted && !newListOpen && (
            <p className="text-sm text-gray-400 text-center py-10">
              No interest lists yet — create one to start collecting families for a future team or season.
            </p>
          )}

          {activeListId && (activeList || activeListId === UNSORTED) && (
            <>
              {/* List header: actions */}
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  {activeList?.name ?? "Unsorted"}
                  {activeList?.sport && (
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-full px-1.5 py-0.5 align-middle">
                      {activeList.sport}
                    </span>
                  )}
                </h2>
                {activeList && (
                  <>
                    <button
                      onClick={() => setPickerOpen(true)}
                      className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5"
                    >
                      + Add players
                    </button>
                    <button onClick={handleRenameList} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline">
                      Rename
                    </button>
                    <button onClick={handleDeleteList} className="text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400 underline">
                      Delete list
                    </button>
                  </>
                )}
                <div className="ml-auto flex items-center gap-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {interestRecipients.length} email{interestRecipients.length !== 1 ? "s" : ""}
                  </span>
                  <button
                    onClick={emailInterestList}
                    disabled={interestRecipients.length === 0}
                    className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 disabled:opacity-40 transition-colors"
                  >
                    Compose email
                  </button>
                </div>
              </div>

              {/* Add manual contact */}
              {activeList && (
                <form
                  action={async (fd) => { await handleAdd(fd); }}
                  className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3"
                >
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Add outside contact</h3>
                  <input type="hidden" name="list_id" value={activeList.id} />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">First name *</label>
                      <input name="first_name" required placeholder="Jane" className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Last name</label>
                      <input name="last_name" placeholder="Smith" className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Email</label>
                      <input name="email" type="email" placeholder="jane@example.com" className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Phone</label>
                      <input name="phone" type="tel" placeholder="555-000-0000" className={inputCls} />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">Notes</label>
                      <input name="notes" placeholder="Optional" className={inputCls} />
                    </div>
                  </div>
                  <button type="submit" className="rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm font-medium px-4 py-2 transition-colors">
                    Add contact
                  </button>
                </form>
              )}

              {/* Entries */}
              {activeEntries.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  Nobody on this list yet — add players or an outside contact above.
                </p>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  {activeEntries.map(entry => {
                    const pc = entry.player_id ? playerContacts[entry.player_id] : null;
                    const meta = entry.player_id
                      ? (pc?.parents ?? [])
                          .map(p => [p.name, p.email].filter(Boolean).join(" · "))
                          .join("  |  ") || "No parent contact on file"
                      : [entry.email, entry.phone, entry.notes].filter(Boolean).join(" · ");
                    return (
                      <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {entry.first_name} {entry.last_name}
                            {entry.player_id ? (
                              <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 rounded-full px-1.5 py-0.5">Roster</span>
                            ) : (
                              entry.sport && activeListId === UNSORTED && (
                                <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-full px-1.5 py-0.5">{entry.sport}</span>
                              )
                            )}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{meta}</p>
                        </div>
                        <button
                          onClick={() => handleDelete(entry.id)}
                          disabled={pending}
                          className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 text-lg leading-none transition-colors"
                          aria-label="Remove"
                        >×</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Player picker modal ───────────────────────────────── */}
      {pickerOpen && activeList && (
        <InterestPlayerPicker
          teams={teams}
          alreadyIn={activePlayerIds}
          listName={activeList.name}
          busy={pending}
          onAdd={handleAddPlayers}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {/* ── Composer modal ────────────────────────────────────── */}
      {composer && (
        <MessageComposer
          recipients={composer.recipients}
          channel="email"
          onClose={() => setComposer(null)}
        />
      )}
    </>
  );
}
