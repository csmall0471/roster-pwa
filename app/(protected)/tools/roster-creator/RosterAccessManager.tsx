"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addRosterAdmin, removeRosterAdmin, type RosterAdminRow } from "./actions";

// Owner-only panel: grant/revoke Roster-Creator access by phone number. Invited
// people log in with phone OTP and share these seasons — nothing else.
function fmtPhone(key: string): string {
  return key.length === 10 ? `(${key.slice(0, 3)}) ${key.slice(3, 6)}-${key.slice(6)}` : key;
}

export default function RosterAccessManager({ admins }: { admins: RosterAdminRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const loginUrl =
    typeof window !== "undefined" ? `${window.location.origin}/roster-login` : "/roster-login";

  function add() {
    setError(null);
    start(async () => {
      const res = await addRosterAdmin(phone, label);
      if (res.error) setError(res.error);
      else {
        setPhone("");
        setLabel("");
        router.refresh();
      }
    });
  }

  function remove(id: string) {
    start(async () => {
      await removeRosterAdmin(id);
      router.refresh();
    });
  }

  return (
    <div className="mb-8 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          Share access {admins.length > 0 && <span className="text-gray-400">({admins.length})</span>}
        </span>
        <span className="text-xs text-gray-400">{open ? "Close" : "Manage"}</span>
      </button>

      {open && (
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3 space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Give someone access to <strong>only</strong> the Roster Creator by phone number. They sign in with a
            text code (no email or password) and can build these same seasons with you — they can&rsquo;t see your
            teams, players, or events.
          </p>

          {/* Share link — the roster-only sign-in page (no family features). */}
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 px-3 py-2">
            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">Send them this link:</span>
            <code className="flex-1 min-w-0 truncate text-xs text-gray-700 dark:text-gray-300">{loginUrl}</code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(loginUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="shrink-0 rounded-md border border-gray-300 dark:border-gray-700 px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          {admins.length > 0 && (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800 rounded-lg border border-gray-200 dark:border-gray-800">
              {admins.map((a) => (
                <li key={a.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium text-gray-800 dark:text-gray-200">{a.label || fmtPhone(a.phone_key)}</span>
                    {a.label && <span className="ml-2 text-xs text-gray-400">{fmtPhone(a.phone_key)}</span>}
                    <span
                      className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        a.linked
                          ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                      }`}
                    >
                      {a.linked ? "active" : "not signed in yet"}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(a.id)}
                    disabled={pending}
                    className="shrink-0 text-xs font-medium text-gray-400 hover:text-red-600 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">Name</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Helper's name"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(623) 555-1234"
                inputMode="tel"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-1.5 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={add}
              disabled={pending || !phone.trim()}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {pending ? "…" : "Grant access"}
            </button>
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
