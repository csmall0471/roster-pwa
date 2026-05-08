"use client";

import { useState, useMemo, useTransition } from "react";
import type { TeamWithRoster, InterestEntry } from "../page";
import MessageComposer from "../../players/_components/MessageComposer";
import { addInterestEntry, deleteInterestEntry } from "../actions";

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

const SPORTS = ["Basketball", "Soccer", "Baseball", "Softball", "Football", "Volleyball", "Other"];

export default function EmailHub({
  teams,
  interestEntries: initialEntries,
}: {
  teams: TeamWithRoster[];
  interestEntries: InterestEntry[];
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
  const [entries, setEntries]     = useState<InterestEntry[]>(initialEntries);
  const [sportFilter, setSportFilter] = useState<string>("all");
  const [addSport, setAddSport]   = useState(SPORTS[0]);
  const [addError, setAddError]   = useState<string | null>(null);
  const [pending, startPending]   = useTransition();

  const entrySports = useMemo(() => [...new Set(entries.map(e => e.sport))].sort(), [entries]);
  const visibleEntries = sportFilter === "all" ? entries : entries.filter(e => e.sport === sportFilter);

  async function handleAdd(formData: FormData) {
    const result = await addInterestEntry(formData);
    if (result.error) { setAddError(result.error); return; }
    setAddError(null);
  }

  function handleDelete(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id));
    startPending(async () => { await deleteInterestEntry(id); });
  }

  function emailInterestList() {
    const list = visibleEntries.filter(e => e.email);
    const recipients: Recipient[] = list.map(e => ({
      name: `${e.first_name} ${e.last_name}`.trim(),
      email: e.email,
      phone: e.phone,
    }));
    const label = sportFilter === "all" ? "Interest List" : `${sportFilter} Interest List`;
    setComposer({ recipients, context: label });
  }

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
        <div className="space-y-6">
          {/* Add form */}
          <form
            action={async (fd) => { await handleAdd(fd); setAddSport(fd.get("sport") as string ?? SPORTS[0]); }}
            className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3"
          >
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Add contact</h2>
            {addError && <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400 rounded px-2 py-1">{addError}</p>}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Sport *</label>
                <input
                  name="sport"
                  list="sport-list"
                  required
                  value={addSport}
                  onChange={e => setAddSport(e.target.value)}
                  placeholder="Basketball"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
                <datalist id="sport-list">
                  {SPORTS.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">First name *</label>
                <input name="first_name" required placeholder="Jane" className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Last name</label>
                <input name="last_name" placeholder="Smith" className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Email</label>
                <input name="email" type="email" placeholder="jane@example.com" className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Phone</label>
                <input name="phone" type="tel" placeholder="555-000-0000" className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Notes</label>
                <input name="notes" placeholder="Optional" className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
            </div>
            <button type="submit" className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 transition-colors">
              Add to list
            </button>
          </form>

          {/* Filter + email button */}
          {entries.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={sportFilter}
                onChange={e => setSportFilter(e.target.value)}
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm px-3 py-1.5 text-gray-900 dark:text-white"
              >
                <option value="all">All sports</option>
                {entrySports.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {visibleEntries.filter(e => e.email).length} with email
              </span>
              <button
                onClick={emailInterestList}
                disabled={visibleEntries.filter(e => e.email).length === 0}
                className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 disabled:opacity-40 transition-colors"
              >
                Compose email
              </button>
            </div>
          )}

          {/* List */}
          {visibleEntries.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No contacts yet.</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {visibleEntries.map(entry => (
                <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {entry.first_name} {entry.last_name}
                      <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-full px-1.5 py-0.5">{entry.sport}</span>
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {[entry.email, entry.phone, entry.notes].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    disabled={pending}
                    className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 text-lg leading-none transition-colors"
                    aria-label="Remove"
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Composer modal ────────────────────────────────────── */}
      {composer && (
        <MessageComposer
          recipients={composer.recipients}
          channel="email"
          onClose={() => setComposer(null)}
          teamContext={{ name: composer.context }}
        />
      )}
    </>
  );
}
