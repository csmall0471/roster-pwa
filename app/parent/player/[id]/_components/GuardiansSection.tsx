"use client";

import { useState } from "react";
import { updateAnyParent, addCoparent } from "../actions";
import { track } from "@vercel/analytics";

export type GuardianData = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
};

const inputCls = "w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

function GuardianRow({
  guardian,
  isMe,
  kidCount,
}: {
  guardian: GuardianData;
  isMe: boolean;
  kidCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(guardian);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!draft.first_name.trim() || !draft.email.trim()) {
      setError("First name and email are required.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await updateAnyParent(guardian.id, draft);
    setSaving(false);
    if (result.error) {
      setError(result.error);
    } else {
      track("guardian_updated");
      setOpen(false);
    }
  }

  function handleCancel() {
    setDraft(guardian);
    setOpen(false);
    setError(null);
  }

  return (
    <div className="border-t border-gray-100 dark:border-gray-800">
      <button
        onClick={() => { setOpen((o) => !o); if (open) handleCancel(); }}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
      >
        <div>
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {guardian.first_name} {guardian.last_name}
            {isMe && <span className="ml-2 text-xs text-blue-500 dark:text-blue-400">(you)</span>}
          </span>
          {!open && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {guardian.email}{guardian.phone ? ` · ${guardian.phone}` : ""}
            </p>
          )}
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 ml-4">{open ? "▲" : "Edit"}</span>
      </button>

      {open && (
        <div className="px-5 pb-4 space-y-3">
          {isMe && kidCount > 1 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">Your info is shared across all {kidCount} of your kids.</p>
          )}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">First name</label>
              <input type="text" value={draft.first_name} onChange={(e) => setDraft((d) => ({ ...d, first_name: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Last name</label>
              <input type="text" value={draft.last_name} onChange={(e) => setDraft((d) => ({ ...d, last_name: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Email</label>
            <input type="email" value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Phone</label>
            <input type="tel" value={draft.phone ?? ""} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value || null }))} placeholder="+1 (555) 000-0000" className={inputCls} />
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={handleSave} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={handleCancel} className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddGuardianForm({
  playerId,
  onAdded,
}: {
  playerId: string;
  onAdded: (g: GuardianData) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ first_name: "", last_name: "", email: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!draft.first_name.trim() || !draft.email.trim()) {
      setError("First name and email are required.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await addCoparent(playerId, {
      first_name: draft.first_name,
      last_name: draft.last_name,
      email: draft.email,
      phone: draft.phone || null,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
    } else {
      track("guardian_added");
      onAdded({
        id: result.parentId!,
        first_name: draft.first_name.trim(),
        last_name: draft.last_name.trim(),
        email: draft.email.trim(),
        phone: draft.phone?.trim() || null,
      });
      setDraft({ first_name: "", last_name: "", email: "", phone: "" });
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <div className="border-t border-gray-100 dark:border-gray-800 px-5 py-3">
        <button onClick={() => setOpen(true)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
          + Add guardian
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-100 dark:border-gray-800 px-5 py-4 space-y-3">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">New guardian</p>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">First name</label>
          <input type="text" value={draft.first_name} onChange={(e) => setDraft((d) => ({ ...d, first_name: e.target.value }))} className={inputCls} autoFocus />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Last name</label>
          <input type="text" value={draft.last_name} onChange={(e) => setDraft((d) => ({ ...d, last_name: e.target.value }))} className={inputCls} />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Email</label>
        <input type="email" value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} className={inputCls} />
      </div>
      <div>
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Phone</label>
        <input type="tel" value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} placeholder="+1 (555) 000-0000" className={inputCls} />
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={handleSave} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {saving ? "Adding…" : "Add guardian"}
        </button>
        <button onClick={() => { setOpen(false); setError(null); setDraft({ first_name: "", last_name: "", email: "", phone: "" }); }} className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function GuardiansSection({
  playerId,
  initialGuardians,
  myParentId,
  kidCount,
}: {
  playerId: string;
  initialGuardians: GuardianData[];
  myParentId: string;
  kidCount: number;
}) {
  const [guardians, setGuardians] = useState(initialGuardians);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-5 py-3">
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          Guardians
        </h2>
      </div>

      {guardians.map((g) => (
        <GuardianRow
          key={g.id}
          guardian={g}
          isMe={g.id === myParentId}
          kidCount={kidCount}
        />
      ))}

      <AddGuardianForm
        playerId={playerId}
        onAdded={(g) => setGuardians((prev) => [...prev, g])}
      />
    </div>
  );
}
