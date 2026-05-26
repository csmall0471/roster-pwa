"use client";

import { useState } from "react";
import { updateParentInfo } from "../actions";

export type ParentInfoData = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
};

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="px-5 py-3 flex items-start justify-between gap-4">
      <dt className="text-xs text-gray-500 dark:text-gray-400 shrink-0 pt-0.5">{label}</dt>
      <dd className="text-sm text-gray-900 dark:text-white text-right break-all">{value}</dd>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export default function ParentInfoForm({
  initialData,
  kidCount,
}: {
  initialData: ParentInfoData;
  kidCount: number;
}) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(initialData);
  const [draft, setDraft] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!draft.first_name.trim() || !draft.email.trim()) {
      setError("First name and email are required.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await updateParentInfo(draft);
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
          Your info
        </h2>
        {editing && kidCount > 1 ? (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            Applies to all {kidCount} kids
          </span>
        ) : !editing ? (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Edit
          </button>
        ) : null}
      </div>

      {!editing ? (
        <>
          <dl className="divide-y divide-gray-100 dark:divide-gray-800">
            <InfoRow label="Name" value={`${saved.first_name} ${saved.last_name}`} />
            <InfoRow label="Email" value={saved.email} />
            <InfoRow label="Phone" value={saved.phone} />
          </dl>
          {kidCount > 1 && (
            <p className="px-5 py-3 text-xs text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-800">
              Your contact info is shared across all {kidCount} of your kids.
            </p>
          )}
        </>
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
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Phone</label>
            <input
              type="tel"
              value={draft.phone ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value || null }))}
              placeholder="+1 (555) 000-0000"
              className={inputCls}
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
