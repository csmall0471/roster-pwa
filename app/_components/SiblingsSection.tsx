"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addSibling,
  updateSibling,
  deleteSibling,
  linkPlayerSibling,
  type SiblingItem,
} from "@/app/actions/siblings";
import { GRADE_OPTIONS, SHIRT_SIZE_OPTIONS } from "@/lib/types";

export type LinkablePlayer = { id: string; name: string };

// The common, remembered fields (match PLAYER_ATTRIBUTE_CATALOG labels).
const ATTRS = ["Grade", "Shirt size", "Birthdate"] as const;

const inputCls =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

type Draft = { firstName: string; lastName: string } & Record<(typeof ATTRS)[number], string>;

// Split a stored "First Last" name; everything before the last token is the
// first name (handles middle names), the last token is the surname.
function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: full.trim(), lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

function toDraft(s: SiblingItem | undefined, defaultLastName: string): Draft {
  const { firstName, lastName } = s ? splitName(s.name) : { firstName: "", lastName: defaultLastName };
  return {
    firstName,
    lastName,
    Grade: String(s?.attributes?.["Grade"] ?? ""),
    "Shirt size": String(s?.attributes?.["Shirt size"] ?? ""),
    Birthdate: String(s?.attributes?.["Birthdate"] ?? ""),
  };
}

function buildAttrs(d: Draft): SiblingItem["attributes"] {
  const a: SiblingItem["attributes"] = {};
  for (const k of ATTRS) {
    const v = d[k].trim();
    if (v) a[k] = v;
  }
  return a;
}

function summary(s: SiblingItem): string {
  return ATTRS.map((k) => s.attributes?.[k])
    .filter((v) => v !== undefined && v !== "")
    .map(String)
    .join(" · ");
}

function SiblingForm({
  playerId,
  sibling,
  defaultLastName,
  onDone,
}: {
  playerId: string;
  sibling?: SiblingItem;
  defaultLastName: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(toDraft(sibling, defaultLastName));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const fullName = `${draft.firstName.trim()} ${draft.lastName.trim()}`.trim();

  function save() {
    if (!draft.firstName.trim()) {
      setError("First name is required.");
      return;
    }
    setError(null);
    start(async () => {
      const res = sibling
        ? await updateSibling(playerId, sibling.name, fullName, buildAttrs(draft))
        : await addSibling(playerId, fullName, buildAttrs(draft));
      if (res.error) setError(res.error);
      else {
        onDone();
        router.refresh();
      }
    });
  }

  function remove() {
    if (!sibling) {
      onDone();
      return;
    }
    start(async () => {
      await deleteSibling(playerId, sibling.name);
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="px-4 py-3 space-y-2 bg-gray-50 dark:bg-gray-800/50">
      <div className="grid grid-cols-2 gap-2">
        <input
          className={inputCls}
          placeholder="Sibling first name"
          value={draft.firstName}
          onChange={(e) => setDraft((d) => ({ ...d, firstName: e.target.value }))}
          autoFocus
        />
        <input
          className={inputCls}
          placeholder="Last name"
          value={draft.lastName}
          onChange={(e) => setDraft((d) => ({ ...d, lastName: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {ATTRS.map((k) => {
          const labelEl = (
            <span className="block text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-0.5">{k}</span>
          );
          if (k === "Birthdate") {
            return (
              <label key={k}>
                {labelEl}
                <input
                  className={inputCls}
                  type="date"
                  value={draft[k]}
                  onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                />
              </label>
            );
          }
          const options = k === "Grade" ? GRADE_OPTIONS : SHIRT_SIZE_OPTIONS;
          const cur = draft[k];
          const opts = cur && !options.includes(cur) ? [cur, ...options] : options;
          return (
            <label key={k}>
              {labelEl}
              <select
                className={inputCls}
                value={cur}
                onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
              >
                <option value="">—</option>
                {opts.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          onClick={remove}
          disabled={pending}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
            sibling
              ? "border-red-300 dark:border-red-800 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
              : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          }`}
        >
          {sibling ? "Remove" : "Cancel"}
        </button>
      </div>
    </div>
  );
}

// A sibling that is itself a roster player: shown read-only with a badge and an
// unlink button (their details live on their own player record).
function LinkedRow({
  playerId,
  sibling,
}: {
  playerId: string;
  sibling: SiblingItem;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function unlink() {
    start(async () => {
      await deleteSibling(playerId, sibling.name);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-medium text-gray-900 dark:text-white text-sm">{sibling.name}</span>
        <span className="rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
          player
        </span>
      </div>
      <button
        onClick={unlink}
        disabled={pending}
        className="text-xs font-medium text-gray-400 hover:text-red-600 disabled:opacity-50"
      >
        {pending ? "…" : "Unlink"}
      </button>
    </div>
  );
}

function LinkPlayerControl({
  playerId,
  players,
}: {
  playerId: string;
  players: LinkablePlayer[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function link() {
    if (!selected) return;
    setError(null);
    start(async () => {
      const res = await linkPlayerSibling(playerId, selected);
      if (res.error) setError(res.error);
      else {
        setOpen(false);
        setSelected("");
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2.5 w-full text-left text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        ↳ Link an existing player as a sibling
      </button>
    );
  }

  return (
    <div className="px-4 py-3 space-y-2 bg-gray-50 dark:bg-gray-800/50">
      <select className={inputCls} value={selected} onChange={(e) => setSelected(e.target.value)}>
        <option value="">— Choose a player —</option>
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={link}
          disabled={pending || !selected}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Linking…" : "Link"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setSelected("");
          }}
          className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function SiblingsSection({
  playerId,
  playerLastName = "",
  initialSiblings,
  linkablePlayers = [],
}: {
  playerId: string;
  playerLastName?: string; // pre-fills a new sibling's last name (same family)
  initialSiblings: SiblingItem[];
  linkablePlayers?: LinkablePlayer[];
}) {
  const [openName, setOpenName] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // A player must never list themselves: linking is symmetric and stores a row
  // with player_id = this player on the family (so it appears on the OTHER kid's
  // page). Exclude that self-row here.
  const siblings = initialSiblings.filter((s) => s.player_id !== playerId);

  const linkedIds = new Set(siblings.map((s) => s.player_id).filter(Boolean) as string[]);
  const available = linkablePlayers.filter((p) => p.id !== playerId && !linkedIds.has(p.id));

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          Siblings ({siblings.length})
        </h2>
        {!adding && (
          <button
            onClick={() => {
              setAdding(true);
              setOpenName(null);
            }}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            + Add sibling
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
        {siblings.length === 0 && !adding && (
          <p className="px-4 py-4 text-sm text-gray-400 dark:text-gray-500">
            No siblings saved yet. Add one to pre-fill future event signups.
          </p>
        )}

        {siblings.map((s) => {
          if (s.player_id) return <LinkedRow key={s.name} playerId={playerId} sibling={s} />;
          const isOpen = openName === s.name;
          const sub = summary(s);
          return (
            <div key={s.name}>
              <button
                onClick={() => {
                  setOpenName(isOpen ? null : s.name);
                  setAdding(false);
                }}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="min-w-0">
                  <span className="font-medium text-gray-900 dark:text-white text-sm">{s.name}</span>
                  {sub && <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{sub}</span>}
                </div>
                <span className="text-gray-400 text-xs">{isOpen ? "Close" : "Edit"}</span>
              </button>
              {isOpen && (
                <SiblingForm playerId={playerId} sibling={s} defaultLastName={playerLastName} onDone={() => setOpenName(null)} />
              )}
            </div>
          );
        })}

        {adding && <SiblingForm playerId={playerId} defaultLastName={playerLastName} onDone={() => setAdding(false)} />}

        {available.length > 0 && <LinkPlayerControl playerId={playerId} players={available} />}
      </div>
    </section>
  );
}
