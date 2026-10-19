"use client";

import { useState } from "react";

// Coach "view as": opens the public signup page in preview mode in a new tab,
// showing exactly what a chosen family (or an account-less guest) sees —
// prefilled kids, their existing RSVP, dependent questions, the works. The
// public page re-verifies the coach server-side; preview never saves anything.
export default function PreviewAsMenu({
  slug,
  parents,
}: {
  slug: string;
  parents: { id: string; name: string; players: string[] }[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const query = q.trim().toLowerCase();
  const shown = query
    ? parents.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.players.some((k) => k.toLowerCase().includes(query))
      )
    : parents;

  const openPreview = (param: string) => {
    window.open(`/event/${slug}?preview=${encodeURIComponent(param)}`, "_blank");
    setOpen(false);
    setQ("");
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        👁 Preview as…
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-40 mt-1 w-72 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl">
            <div className="p-2">
              <input
                autoFocus
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none"
                placeholder="Search parent or kid…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="max-h-72 overflow-y-auto pb-1">
              <button
                type="button"
                onClick={() => openPreview("guest")}
                className="block w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <span className="font-medium">Guest</span>
                <span className="block text-xs text-gray-400">No account — blank form</span>
              </button>
              {shown.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openPreview(p.id)}
                  className="block w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <span className="font-medium">{p.name}</span>
                  {p.players.length > 0 && (
                    <span className="block truncate text-xs text-gray-400">
                      {p.players.join(", ")}
                    </span>
                  )}
                </button>
              ))}
              {shown.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-400">No matching parents.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
