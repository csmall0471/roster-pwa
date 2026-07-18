"use client";

import { useState, useTransition, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { track } from "@vercel/analytics";
import { removeFromRoster, updateRosterEntry } from "../roster-actions";
import {
  setRosterTag,
  createRosterTagType,
  updateRosterTagType,
  deleteRosterTagType,
} from "../roster-tag-actions";
import MessageComposer from "../../players/_components/MessageComposer";
import type { RosterTagType } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────

type RosterParent = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string;
};

type RosterPlayer = {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  player_parents: Array<{ parents: RosterParent }>;
};

function calcAge(dob: string): number {
  const birth = new Date(dob + "T00:00:00");
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

const ELIGIBILITY_CUTOFF = new Date("2026-08-01T00:00:00");

function ageOnCutoff(dob: string): number {
  const birth = new Date(dob + "T00:00:00");
  let age = ELIGIBILITY_CUTOFF.getFullYear() - birth.getFullYear();
  const m = ELIGIBILITY_CUTOFF.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ELIGIBILITY_CUTOFF.getDate() < birth.getDate())) age--;
  return age;
}

function division(age: number): string {
  return `${Math.ceil(age / 2) * 2}U`;
}

type RosterEntry = {
  id: string;
  jersey_number: number | null;
  status: string;
  tags?: Record<string, string> | null;
  players: RosterPlayer;
};

// ── CSV export ────────────────────────────────────────────────

// Quote a cell only when it contains a comma, quote, or newline; escape any
// embedded quotes by doubling them (RFC 4180).
function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// One row per player: identity, status, each tag category as its own column,
// then all parents' names/phones/emails collapsed into three columns.
function buildRosterCsv(roster: RosterEntry[], tagTypes: RosterTagType[]): string {
  const header = [
    "Jersey",
    "First Name",
    "Last Name",
    "Age",
    "Date of Birth",
    "Status",
    ...tagTypes.map((t) => t.name),
    "Parents",
    "Parent Phones",
    "Parent Emails",
  ];
  const rows = roster.map((entry) => {
    const p = entry.players;
    const parents = p.player_parents.map((pp) => pp.parents);
    return [
      entry.jersey_number ?? "",
      p.first_name,
      p.last_name,
      p.date_of_birth ? calcAge(p.date_of_birth) : "",
      p.date_of_birth ?? "",
      entry.status,
      ...tagTypes.map((t) => entry.tags?.[t.id] ?? ""),
      parents.map((par) => `${par.first_name} ${par.last_name}`.trim()).join("; "),
      parents.map((par) => par.phone ?? "").filter(Boolean).join("; "),
      parents.map((par) => par.email ?? "").filter(Boolean).join("; "),
    ];
  });
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

function slugForFile(s: string): string {
  return s.trim().replace(/[^\w-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "roster";
}

// ── RosterTable ───────────────────────────────────────────────

export default function RosterTable({
  roster,
  teamId,
  primaryPhotos = {},
  tagTypes: initialTagTypes = [],
  team,
}: {
  roster: RosterEntry[];
  teamId: string;
  primaryPhotos?: Record<string, string>;
  tagTypes?: RosterTagType[];
  team?: { name: string; organization?: string | null; season?: string | null; sport?: string | null };
}) {
  const [messageChannel, setMessageChannel] = useState<"email" | "text" | null>(null);
  const [tagTypes, setTagTypes] = useState<RosterTagType[]>(initialTagTypes);
  const [managingTags, setManagingTags] = useState(false);

  const isCcvFootball =
    team?.organization === "CCV" &&
    (team?.sport?.toLowerCase().includes("football") ?? false);

  const active   = roster.filter((r) => r.status === "active");
  const inactive = roster.filter((r) => r.status === "inactive");

  // Collect unique parents across the whole roster for messaging
  const allRecipients = useMemo(() => {
    const seen = new Set<string>();
    const result: { name: string; email: string | null; phone: string | null }[] = [];
    for (const entry of roster) {
      for (const pp of entry.players.player_parents) {
        const par = pp.parents;
        if (!seen.has(par.id)) {
          seen.add(par.id);
          result.push({
            name: `${par.first_name} ${par.last_name}`,
            email: par.email,
            phone: par.phone,
          });
        }
      }
    }
    return result;
  }, [roster]);

  // Export the whole roster (active + inactive, as displayed) to a CSV the coach
  // can open in Excel/Sheets. Built client-side from the data already loaded.
  function exportCsv() {
    const csv = buildRosterCsv(roster, tagTypes);
    const base = slugForFile([team?.name, team?.season].filter(Boolean).join("-"));
    // Prepend a UTF-8 BOM so Excel reads accented names correctly.
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}-roster.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    track("roster_export_csv", { team: teamId, players: roster.length });
  }

  return (
    <div className="space-y-4">
      {/* Header row: counts + message buttons */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {active.length} active{inactive.length > 0 ? ` · ${inactive.length} inactive` : ""}
        </p>
        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            ↓ Export CSV
          </button>
          <button
            onClick={() => setManagingTags(true)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            🏷️ Tags
          </button>
          <button
            onClick={() => setMessageChannel("email")}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Email team
          </button>
          <button
            onClick={() => setMessageChannel("text")}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Text team
          </button>
        </div>
      </div>

      {/* Active roster */}
      <div className="space-y-2">
        {active.map((entry) => (
          <RosterRow
            key={entry.id}
            entry={entry}
            teamId={teamId}
            photoUrl={primaryPhotos[entry.players.id]}
            showEligibility={isCcvFootball}
            tagTypes={tagTypes}
          />
        ))}
      </div>

      {/* Inactive roster */}
      {inactive.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
            Inactive
          </p>
          <div className="space-y-2 opacity-60">
            {inactive.map((entry) => (
              <RosterRow
                key={entry.id}
                entry={entry}
                teamId={teamId}
                photoUrl={primaryPhotos[entry.players.id]}
                showEligibility={isCcvFootball}
              />
            ))}
          </div>
        </div>
      )}

      {/* Message composer modal */}
      {messageChannel && (
        <MessageComposer
          recipients={allRecipients}
          channel={messageChannel}
          onClose={() => setMessageChannel(null)}
          teamContext={team}
        />
      )}

      {managingTags && (
        <TagTypesManager
          tagTypes={tagTypes}
          onChange={setTagTypes}
          onClose={() => setManagingTags(false)}
        />
      )}
    </div>
  );
}

// ── RosterRow ─────────────────────────────────────────────────

function RosterRow({
  entry,
  teamId,
  photoUrl,
  showEligibility = false,
  tagTypes = [],
}: {
  entry: RosterEntry;
  teamId: string;
  photoUrl?: string;
  showEligibility?: boolean;
  tagTypes?: RosterTagType[];
}) {
  const [jersey, setJersey] = useState(entry.jersey_number?.toString() ?? "");
  const [status, setStatus] = useState<"active" | "inactive">(
    entry.status as "active" | "inactive"
  );
  const [pending, startTransition] = useTransition();
  const [savedTick, setSavedTick] = useState(false);

  useEffect(() => {
    setJersey(entry.jersey_number?.toString() ?? "");
    setStatus(entry.status as "active" | "inactive");
  }, [entry.jersey_number, entry.status]);

  const savedJersey = entry.jersey_number?.toString() ?? "";

  // Auto-save: persist whenever the jersey field is left or a status is toggled.
  // Skips the write when nothing actually changed from what's stored.
  function commit(nextJersey: string, nextStatus: "active" | "inactive") {
    const parsed = nextJersey === "" ? null : parseInt(nextJersey, 10);
    const num = parsed === null || Number.isNaN(parsed) ? null : parsed;
    if ((num?.toString() ?? "") === savedJersey && nextStatus === entry.status) return;
    startTransition(async () => {
      await updateRosterEntry(entry.id, teamId, num, nextStatus);
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 1500);
    });
  }

  function toggleStatus() {
    const next = status === "active" ? "inactive" : "active";
    setStatus(next);
    commit(jersey, next);
  }

  function handleRemove() {
    const name = `${entry.players.first_name} ${entry.players.last_name}`;
    if (!confirm(`Remove ${name} from this team?`)) return;
    startTransition(async () => {
      await removeFromRoster(entry.id, teamId);
    });
  }

  return (
    <div
      className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 transition-opacity ${
        pending ? "opacity-40 pointer-events-none" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Jersey number */}
        <div className="flex items-center gap-0.5 shrink-0">
          <span className="text-xs text-gray-400 dark:text-gray-500 select-none">#</span>
          <input
            type="number"
            min={0}
            max={99}
            value={jersey}
            onChange={(e) => setJersey(e.target.value)}
            onBlur={() => commit(jersey, status)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            placeholder="—"
            aria-label="Jersey number"
            className="w-10 text-center rounded border border-gray-200 dark:border-gray-600 py-0.5 text-sm font-mono text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Player photo */}
        <Link href={`/players/${entry.players.id}`} className="shrink-0">
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt={`${entry.players.first_name} ${entry.players.last_name}`}
              width={44}
              height={60}
              className="w-11 h-[60px] object-cover rounded-lg border border-gray-200 dark:border-gray-700"
            />
          ) : (
            <div className="w-11 h-[60px] rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-300 dark:text-gray-600 text-base">
              👤
            </div>
          )}
        </Link>

        {/* Player info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <Link
              href={`/players/${entry.players.id}`}
              className="font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400"
            >
              {entry.players.first_name} {entry.players.last_name}
            </Link>
            {entry.players.date_of_birth && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Age {calcAge(entry.players.date_of_birth)}
              </span>
            )}
            {showEligibility && (
              entry.players.date_of_birth ? (
                <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300">
                  {division(ageOnCutoff(entry.players.date_of_birth))} eligible
                </span>
              ) : (
                <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                  No DOB
                </span>
              )
            )}
          </div>

          {entry.players.player_parents.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {entry.players.player_parents.map((pp) => (
                <div
                  key={pp.parents.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-gray-600 dark:text-gray-400"
                >
                  <span className="font-medium">
                    {pp.parents.first_name} {pp.parents.last_name}
                  </span>
                  {pp.parents.phone && (
                    <a href={`tel:${pp.parents.phone}`} className="text-blue-600 hover:underline tabular-nums">
                      {pp.parents.phone}
                    </a>
                  )}
                  {pp.parents.email && (
                    <a href={`mailto:${pp.parents.email}`} className="text-blue-600 hover:underline truncate max-w-[200px]">
                      {pp.parents.email}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {tagTypes.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {tagTypes.map((tt) => (
                <TagControl
                  key={tt.id}
                  rosterId={entry.id}
                  teamId={teamId}
                  tagType={tt}
                  value={entry.tags?.[tt.id] ?? ""}
                />
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0 text-sm">
          <button
            onClick={toggleStatus}
            className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
              status === "active"
                ? "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900"
                : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {status}
          </button>

          {pending ? (
            <span className="text-xs text-gray-400">Saving…</span>
          ) : (
            savedTick && <span className="text-xs text-green-600 dark:text-green-400">Saved ✓</span>
          )}

          <button onClick={handleRemove} className="text-red-500 hover:underline">
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Roster tags ───────────────────────────────────────────────
const mgrInput =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:border-blue-500 focus:outline-none";

// Color palette for tag options — full static class strings so Tailwind keeps
// them. `chip` styles the roster chip; `swatch` is the picker dot.
const TAG_PALETTE: { key: string; chip: string; swatch: string }[] = [
  { key: "gray",   chip: "border-gray-200 bg-gray-100 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300", swatch: "bg-gray-400" },
  { key: "red",    chip: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300", swatch: "bg-red-500" },
  { key: "orange", chip: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300", swatch: "bg-orange-500" },
  { key: "amber",  chip: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300", swatch: "bg-amber-500" },
  { key: "green",  chip: "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300", swatch: "bg-green-500" },
  { key: "teal",   chip: "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-300", swatch: "bg-teal-500" },
  { key: "blue",   chip: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300", swatch: "bg-blue-500" },
  { key: "purple", chip: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900 dark:bg-purple-950 dark:text-purple-300", swatch: "bg-purple-500" },
  { key: "pink",   chip: "border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-900 dark:bg-pink-950 dark:text-pink-300", swatch: "bg-pink-500" },
];
const PALETTE_BY_KEY = new Map(TAG_PALETTE.map((c) => [c.key, c]));
// Distinct auto color for an option with no explicit pick (skips gray).
const autoColorKey = (index: number) => TAG_PALETTE[1 + (index % (TAG_PALETTE.length - 1))].key;
// Chip classes for the value currently selected on a tag.
function chipClassesFor(tagType: RosterTagType, value: string): string {
  const idx = tagType.options.indexOf(value);
  if (idx < 0) return TAG_PALETTE[0].chip; // legacy/unknown value → neutral
  const key = tagType.option_colors?.[idx] || autoColorKey(idx);
  return (PALETTE_BY_KEY.get(key) ?? TAG_PALETTE[0]).chip;
}

type OptDraft = { label: string; color: string };

function ColorSwatches({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1">
      {TAG_PALETTE.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onChange(c.key)}
          aria-label={c.key}
          className={`h-4 w-4 rounded-full ${c.swatch} ${
            value === c.key
              ? "ring-2 ring-gray-500 ring-offset-1 dark:ring-offset-gray-900"
              : "opacity-50 hover:opacity-100"
          }`}
        />
      ))}
    </div>
  );
}

function OptionsEditor({ options, onChange }: { options: OptDraft[]; onChange: (next: OptDraft[]) => void }) {
  const update = (i: number, patch: Partial<OptDraft>) =>
    onChange(options.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  return (
    <div className="space-y-1.5">
      {options.map((o, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            className={`${mgrInput} flex-1`}
            placeholder="Option label"
            value={o.label}
            onChange={(e) => update(i, { label: e.target.value })}
          />
          <ColorSwatches value={o.color || autoColorKey(i)} onChange={(color) => update(i, { color })} />
          <button
            type="button"
            onClick={() => onChange(options.filter((_, j) => j !== i))}
            className="shrink-0 text-sm text-gray-400 hover:text-red-500"
            aria-label="Remove option"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...options, { label: "", color: autoColorKey(options.length) }])}
        className="text-xs font-medium text-blue-600 hover:underline"
      >
        + Add option
      </button>
    </div>
  );
}

// One tag chip on a roster row: a compact select that saves per (team, player).
function TagControl({
  rosterId,
  teamId,
  tagType,
  value,
}: {
  rosterId: string;
  teamId: string;
  tagType: RosterTagType;
  value: string;
}) {
  // Sync from the prop during render (not an effect) so a fresh server value
  // after revalidation is reflected without cascading renders.
  const [val, setVal] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setVal(value);
  }
  const [pending, start] = useTransition();

  function change(next: string) {
    setVal(next);
    start(async () => {
      await setRosterTag(rosterId, teamId, tagType.id, next);
    });
  }

  const chipCls = val
    ? chipClassesFor(tagType, val)
    : "border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-500";
  return (
    <label
      title={tagType.name}
      className={`inline-flex items-center gap-1 rounded-full border pl-2 pr-1 py-0.5 ${chipCls} ${
        pending ? "opacity-50" : ""
      }`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{tagType.name}</span>
      <select
        value={val}
        onChange={(e) => change(e.target.value)}
        aria-label={tagType.name}
        className="cursor-pointer bg-transparent text-xs font-medium focus:outline-none"
      >
        <option value="">—</option>
        {tagType.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {val && !tagType.options.includes(val) && <option value={val}>{val}</option>}
      </select>
    </label>
  );
}

function TagTypeEditor({
  tagType,
  disabled,
  onSave,
  onDelete,
}: {
  tagType: RosterTagType;
  disabled: boolean;
  onSave: (id: string, name: string, options: OptDraft[]) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(tagType.name);
  const [options, setOptions] = useState<OptDraft[]>(
    tagType.options.map((label, i) => ({ label, color: tagType.option_colors?.[i] || autoColorKey(i) }))
  );
  return (
    <div className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
      <input className={mgrInput} value={name} onChange={(e) => setName(e.target.value)} />
      <OptionsEditor options={options} onChange={setOptions} />
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={() => onSave(tagType.id, name, options)}
          disabled={disabled || !name.trim()}
          className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
        >
          Save
        </button>
        <button
          onClick={() => onDelete(tagType.id)}
          disabled={disabled}
          className="text-xs font-medium text-red-600 hover:underline disabled:opacity-40"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function TagTypesManager({
  tagTypes,
  onChange,
  onClose,
}: {
  tagTypes: RosterTagType[];
  onChange: (next: RosterTagType[]) => void;
  onClose: () => void;
}) {
  const freshOptions = (): OptDraft[] => [
    { label: "", color: autoColorKey(0) },
    { label: "", color: autoColorKey(1) },
  ];
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newOptions, setNewOptions] = useState<OptDraft[]>(freshOptions);

  function add() {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    start(async () => {
      const res = await createRosterTagType(name, newOptions);
      if (res.error) setError(res.error);
      else if (res.tagType) {
        onChange([...tagTypes, res.tagType]);
        setNewName("");
        setNewOptions(freshOptions());
      }
    });
  }

  function saveEdit(id: string, name: string, options: OptDraft[]) {
    setError(null);
    start(async () => {
      const res = await updateRosterTagType(id, name, options);
      if (res.error) setError(res.error);
      else if (res.tagType) onChange(tagTypes.map((t) => (t.id === id ? res.tagType! : t)));
    });
  }

  function remove(id: string) {
    if (!window.confirm("Delete this tag category? Players' values for it will no longer show.")) return;
    setError(null);
    start(async () => {
      const res = await deleteRosterTagType(id);
      if (res.error) setError(res.error);
      else onChange(tagTypes.filter((t) => t.id !== id));
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4">
      <div className="my-8 w-full max-w-lg rounded-2xl bg-white shadow-xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-gray-800">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Roster tag categories</h3>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Categories are shared across all your teams; each player&apos;s value is saved per team.
          </p>
          {tagTypes.map((t) => (
            <TagTypeEditor key={t.id} tagType={t} disabled={pending} onSave={saveEdit} onDelete={remove} />
          ))}
          <div className="space-y-2 rounded-lg border border-dashed border-gray-300 p-3 dark:border-gray-700">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">New category</p>
            <input
              className={mgrInput}
              placeholder="Name (e.g. Registration status)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <OptionsEditor options={newOptions} onChange={setNewOptions} />
            <button
              onClick={add}
              disabled={pending || !newName.trim()}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Add category
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end border-t border-gray-200 px-5 py-3 dark:border-gray-800">
          <button
            onClick={onClose}
            className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-semibold text-white dark:bg-white dark:text-gray-900"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
