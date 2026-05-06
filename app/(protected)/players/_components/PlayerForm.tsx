"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { PlayerFormState } from "../actions";
import type { Parent } from "@/lib/types";

interface PlayerData {
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  grade: string | null;
  shirt_size: string | null;
  notes: string | null;
  parents: Pick<Parent, "id" | "first_name" | "last_name" | "email" | "phone">[];
}

interface Props {
  player?: PlayerData;
  action: (prev: PlayerFormState, formData: FormData) => Promise<PlayerFormState>;
}

const GRADES = [
  "Kindergarten",
  "1st", "2nd", "3rd", "4th", "5th", "6th",
  "7th", "8th", "9th", "10th", "11th", "12th",
];

const SHIRT_SIZES = [
  "YXS", "YS", "YM", "YL", "YXL",
  "AXS", "AS", "AM", "AL", "AXL", "AXXL",
];

export default function PlayerForm({ player, action }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const p1 = player?.parents[0];
  const p2 = player?.parents[1];

  return (
    <form action={formAction} className="space-y-8">
      {/* ── Player ─────────────────────────────────── */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
          Player info
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              First name <span className="text-red-500">*</span>
            </label>
            <input
              id="first_name" name="first_name" required
              defaultValue={player?.first_name ?? ""}
              className="input"
            />
          </div>
          <div>
            <label htmlFor="last_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Last name
            </label>
            <input
              id="last_name" name="last_name"
              defaultValue={player?.last_name ?? ""}
              className="input"
            />
          </div>
          <div>
            <label htmlFor="date_of_birth" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Date of birth
            </label>
            <input
              id="date_of_birth" name="date_of_birth" type="date"
              defaultValue={player?.date_of_birth ?? ""}
              className="input"
            />
          </div>
          {/* grade kept as hidden so existing data is preserved on update */}
          <input type="hidden" name="grade" value={player?.grade ?? ""} />
          <div>
            <label htmlFor="shirt_size" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              T-shirt size
            </label>
            <select id="shirt_size" name="shirt_size" defaultValue={player?.shirt_size ?? ""} className="input bg-white dark:bg-gray-900">
              <option value="">—</option>
              {SHIRT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes
            </label>
            <textarea
              id="notes" name="notes" rows={2}
              defaultValue={player?.notes ?? ""}
              className="input resize-none"
            />
          </div>
        </div>
      </section>

      {/* ── Parents ─────────────────────────────────── */}
      <ParentSection n={1} parent={p1} />
      <ParentSection n={2} parent={p2} optional />

      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{state.error}</p>
      )}

      <div className="flex gap-3">
        <button
          type="submit" disabled={pending}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {pending ? "Saving…" : player ? "Save changes" : "Add player"}
        </button>
        <Link
          href="/players"
          className="rounded-lg border border-gray-300 dark:border-gray-600 px-5 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function ParentSection({
  n,
  parent,
  optional,
}: {
  n: 1 | 2;
  parent?: Pick<Parent, "id" | "first_name" | "last_name" | "email" | "phone">;
  optional?: boolean;
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
        Parent / Guardian {n}
        {optional && <span className="font-normal normal-case ml-1 text-gray-400 dark:text-gray-500">(optional)</span>}
      </h3>
      {parent?.id && <input type="hidden" name={`p${n}_id`} value={parent.id} />}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor={`p${n}_first`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First name</label>
          <input id={`p${n}_first`} name={`p${n}_first_name`} defaultValue={parent?.first_name ?? ""} className="input" />
        </div>
        <div>
          <label htmlFor={`p${n}_last`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last name</label>
          <input id={`p${n}_last`} name={`p${n}_last_name`} defaultValue={parent?.last_name ?? ""} className="input" />
        </div>
        <div>
          <label htmlFor={`p${n}_phone`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
          <input id={`p${n}_phone`} name={`p${n}_phone`} type="tel" placeholder="(555) 555-5555" defaultValue={parent?.phone ?? ""} className="input" />
        </div>
        <div>
          <label htmlFor={`p${n}_email`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
          <input id={`p${n}_email`} name={`p${n}_email`} type="email" placeholder="parent@example.com" defaultValue={parent?.email ?? ""} className="input" />
        </div>
      </div>
    </section>
  );
}
