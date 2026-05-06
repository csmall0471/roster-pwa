"use client";

import { useState, useTransition, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { removeFromRoster, updateRosterEntry } from "../roster-actions";
import MessageComposer from "../../players/_components/MessageComposer";

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

type RosterEntry = {
  id: string;
  jersey_number: number | null;
  status: string;
  players: RosterPlayer;
};

// ── RosterTable ───────────────────────────────────────────────

export default function RosterTable({
  roster,
  teamId,
  primaryPhotos = {},
  team,
}: {
  roster: RosterEntry[];
  teamId: string;
  primaryPhotos?: Record<string, string>;
  team?: { name: string; organization?: string | null; season?: string | null };
}) {
  const [messageChannel, setMessageChannel] = useState<"email" | "text" | null>(null);

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

  return (
    <div className="space-y-4">
      {/* Header row: counts + message buttons */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {active.length} active{inactive.length > 0 ? ` · ${inactive.length} inactive` : ""}
        </p>
        <div className="flex gap-2">
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
    </div>
  );
}

// ── RosterRow ─────────────────────────────────────────────────

function RosterRow({
  entry,
  teamId,
  photoUrl,
}: {
  entry: RosterEntry;
  teamId: string;
  photoUrl?: string;
}) {
  const [jersey, setJersey] = useState(entry.jersey_number?.toString() ?? "");
  const [status, setStatus] = useState<"active" | "inactive">(
    entry.status as "active" | "inactive"
  );
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setJersey(entry.jersey_number?.toString() ?? "");
    setStatus(entry.status as "active" | "inactive");
  }, [entry.jersey_number, entry.status]);

  const savedJersey = entry.jersey_number?.toString() ?? "";
  const isDirty = jersey !== savedJersey || status !== entry.status;

  function save() {
    const num = jersey === "" ? null : parseInt(jersey, 10);
    startTransition(async () => {
      await updateRosterEntry(entry.id, teamId, num, status);
    });
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
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0 text-sm">
          <button
            onClick={() => setStatus((s) => (s === "active" ? "inactive" : "active"))}
            className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
              status === "active"
                ? "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900"
                : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {status}
          </button>

          {isDirty && (
            <button onClick={save} className="text-blue-600 hover:underline font-medium">
              Save
            </button>
          )}

          <button onClick={handleRemove} className="text-red-500 hover:underline">
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
