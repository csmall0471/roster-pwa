"use client";

import { useState } from "react";
import { updatePlayerInfo } from "../actions";

export type PlayerInfoData = {
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  shirt_size: string | null;
  grade: string | null;
  notes: string | null;
};

const GRADES = [
  "Pre-K", "Kindergarten",
  "1st", "2nd", "3rd", "4th", "5th", "6th",
  "7th", "8th", "9th", "10th", "11th", "12th",
];

function fmtDob(dob: string) {
  return new Date(dob + "T00:00:00").toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="px-5 py-3 flex items-start justify-between gap-4">
      <dt className="text-xs text-gray-500 dark:text-gray-400 shrink-0 pt-0.5">{label}</dt>
      <dd className="text-sm text-gray-900 dark:text-white text-right">{value}</dd>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export default function PlayerInfoForm({
  playerId,
  initialData,
}: {
  playerId: string;
  initialData: PlayerInfoData;
}) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(initialData);
  const [draft, setDraft] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!draft.first_name.trim() || !draft.last_name.trim()) {
      setError("First and last name are required.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await updatePlayerInfo(playerId, draft);
    setSaving(false);
    if (result.error) {
      setError(result.error);
    } else {
      setSaved(draft);
      setEditing(false);
    }
  }

  function handleCancel() {
    setDraft(saved);
    setEditing(false);
    setError(null);
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          Player info
        </h2>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Edit
          </button>
        )}
      </div>

      {!editing ? (
        <dl className="divide-y divide-gray-100 dark:divide-gray-800">
          <InfoRow label="Name" value={`${saved.first_name} ${saved.last_name}`} />
          <InfoRow label="Birthday" value={saved.date_of_birth ? fmtDob(saved.date_of_birth) : null} />
          <InfoRow label="Grade" value={saved.grade} />
          <InfoRow label="Shirt size" value={saved.shirt_size} />
          <InfoRow label="Notes" value={saved.notes} />
          {!saved.date_of_birth && !saved.grade && !saved.shirt_size && (
            <p className="px-5 py-3 text-xs text-gray-400 dark:text-gray-500">
              Tap Edit to fill in birthday, grade, and shirt size.
            </p>
          )}
        </dl>
      ) : (
        <div className="px-5 py-4 space-y-3">
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">First name</label>
              <input
                type="text"
                value={draft.first_name}
                onChange={(e) => setDraft((d) => ({ ...d, first_name: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Last name</label>
              <input
                type="text"
                value={draft.last_name}
                onChange={(e) => setDraft((d) => ({ ...d, last_name: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Birthday</label>
            <input
              type="date"
              value={draft.date_of_birth ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, date_of_birth: e.target.value || null }))}
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Grade</label>
              <select
                value={draft.grade ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, grade: e.target.value || null }))}
                className={inputCls}
              >
                <option value="">—</option>
                {GRADES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Shirt size</label>
              <input
                type="text"
                value={draft.shirt_size ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, shirt_size: e.target.value || null }))}
                placeholder="e.g. YM, L, XL"
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Notes for coach</label>
            <textarea
              value={draft.notes ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value || null }))}
              rows={2}
              placeholder="Allergies, injuries, anything the coach should know"
              className={`${inputCls} resize-none`}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={handleCancel}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
