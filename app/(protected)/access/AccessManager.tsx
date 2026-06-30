"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TOOLS, type ToolKey } from "@/lib/tools";
import {
  addToolUser,
  setToolGrant,
  removeToolUser,
  type ToolUserRow,
  type ParentOption,
} from "./actions";

function fmtPhone(key: string | null): string {
  if (!key) return "";
  return key.length === 10 ? `(${key.slice(0, 3)}) ${key.slice(3, 6)}-${key.slice(6)}` : key;
}

export default function AccessManager({
  users,
  parents,
}: {
  users: ToolUserRow[];
  parents: ParentOption[];
}) {
  const router = useRouter();
  const [parentId, setParentId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [newTools, setNewTools] = useState<ToolKey[]>(["card-creator"]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  // Picking a parent pre-fills the form; editing any field afterward is fine.
  function pickParent(id: string) {
    setParentId(id);
    const p = parents.find((x) => x.id === id);
    if (!p) return;
    setName(p.name);
    setPhone(p.phone ?? "");
    setEmail(p.email ?? "");
  }

  const loginUrl =
    typeof window !== "undefined" ? `${window.location.origin}/roster-login` : "/roster-login";

  function toggleNewTool(key: ToolKey) {
    setNewTools((prev) => (prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key]));
  }

  function add() {
    setError(null);
    start(async () => {
      const res = await addToolUser({ name, phone, email, tools: newTools });
      if (res.error) {
        setError(res.error);
      } else {
        setParentId("");
        setName("");
        setPhone("");
        setEmail("");
        setNewTools(["card-creator"]);
        router.refresh();
      }
    });
  }

  function toggleGrant(id: string, tool: ToolKey, enabled: boolean) {
    start(async () => {
      const res = await setToolGrant(id, tool, enabled);
      if (res.error) setError(res.error);
      router.refresh();
    });
  }

  function remove(id: string) {
    start(async () => {
      await removeToolUser(id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Share link — the tools sign-in page (no family features). */}
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 px-3 py-2">
        <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">Send them this sign-in link:</span>
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

      {/* People + their grants */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="hidden sm:grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2 border-b border-gray-100 dark:border-gray-800 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          <span>Person</span>
          <span className="text-center">Tools</span>
          <span></span>
        </div>

        {users.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
            No one has been granted access yet. Add someone below.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {users.map((u) => (
              <li
                key={u.id}
                className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 sm:gap-4 px-4 py-3 items-center"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800 dark:text-gray-200 truncate">
                      {u.label || fmtPhone(u.phone_key) || u.email}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        u.linked
                          ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                      }`}
                    >
                      {u.linked ? "active" : "not signed in yet"}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {[fmtPhone(u.phone_key), u.email].filter(Boolean).join(" · ")}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {TOOLS.map((t) => {
                    const on = u.tools.includes(t.key);
                    return (
                      <button
                        key={t.key}
                        type="button"
                        disabled={pending}
                        onClick={() => toggleGrant(u.id, t.key, !on)}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                          on
                            ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                            : "border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                        }`}
                        aria-pressed={on}
                      >
                        {on ? "✓ " : ""}
                        {t.label}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => remove(u.id)}
                  disabled={pending}
                  className="justify-self-start sm:justify-self-end text-xs font-medium text-gray-400 hover:text-red-600 disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add person */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Add a person</h2>

        {parents.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">
              Pick a parent
            </label>
            <select
              value={parentId}
              onChange={(e) => pickParent(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-1.5 text-sm"
            >
              <option value="">Choose a parent…</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.email || p.phone}
                  {p.phone || p.email ? ` — ${[p.phone, p.email].filter(Boolean).join(", ")}` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-gray-400">Or fill in the fields below to invite someone new.</p>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">Name</label>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setParentId("");
              }}
              placeholder="Their name"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">Phone</label>
            <input
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setParentId("");
              }}
              placeholder="(623) 555-1234"
              inputMode="tel"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">
              Email <span className="text-gray-400">(optional)</span>
            </label>
            <input
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setParentId("");
              }}
              placeholder="name@email.com"
              inputMode="email"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Grant:</span>
          {TOOLS.map((t) => {
            const on = newTools.includes(t.key);
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => toggleNewTool(t.key)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  on
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                    : "border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
                aria-pressed={on}
              >
                {on ? "✓ " : ""}
                {t.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={add}
            disabled={pending || (!phone.trim() && !email.trim()) || newTools.length === 0}
            className="ml-auto rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "…" : "Add"}
          </button>
        </div>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </div>
  );
}
