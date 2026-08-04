"use client";

import { useState, useTransition } from "react";
import { sendEventReminder, type SendReminderResult } from "../actions";

export default function EventReminderButton({
  eventId,
  count,
}: {
  eventId: string;
  count: number;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<SendReminderResult | null>(null);
  const [pending, start] = useTransition();

  const families = `${count} famil${count === 1 ? "y" : "ies"}`;

  function send() {
    if (!confirm(`Send a reminder email to ${families} now?`)) return;
    start(async () => {
      const res = await sendEventReminder(eventId, note.trim() || null);
      setResult(res);
      if (!res.error) {
        setOpen(false);
        setNote("");
      }
    });
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Reminder email</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Send everyone who signed up a reminder now — the same email the automatic 2-day reminder uses.
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setResult(null);
            }}
            className="shrink-0 inline-flex items-center rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Send reminder…
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor="reminder-note" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
              Add a note <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              id="reminder-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="e.g. Don't forget water shoes and a towel!"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={send}
              disabled={pending || count === 0}
              className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {pending ? "Sending…" : `Send to ${families}`}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setNote("");
              }}
              disabled={pending}
              className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && (
        <p
          className={`mt-3 text-sm ${
            result.error ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"
          }`}
        >
          {result.error
            ? result.error
            : `✓ Sent ${result.sent} reminder${result.sent === 1 ? "" : "s"}` +
              (result.failed ? ` · ${result.failed} failed` : "") +
              (result.skipped ? ` · ${result.skipped} without an email` : "")}
        </p>
      )}
    </div>
  );
}
