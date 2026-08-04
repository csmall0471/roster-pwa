"use client";

import { useState, useTransition } from "react";
import {
  previewReminder,
  sendEventReminder,
  sendTestReminder,
  updateReminderSettings,
} from "../actions";

function dayLabel(n: number): string {
  if (n === 0) return "On the day";
  if (n === 1) return "1 day before";
  if (n === 7) return "1 week before";
  return `${n} days before`;
}

export default function EventReminderPanel({
  eventId,
  count,
  families,
  initialDaysBefore,
  initialNote,
}: {
  eventId: string;
  count: number;
  families: { id: string; label: string }[];
  initialDaysBefore: number | null;
  initialNote: string;
}) {
  const [daysBefore, setDaysBefore] = useState<number | null>(initialDaysBefore);
  const [note, setNote] = useState(initialNote);
  const [savedNote, setSavedNote] = useState(initialNote);
  const [family, setFamily] = useState(families[0]?.id ?? "");

  const [preview, setPreview] = useState<{
    subject: string;
    html: string;
    recipients: string[];
    bcc: string | null;
  } | null>(null);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [savingSchedule, startSchedule] = useTransition();
  const [savingNote, startNote] = useTransition();
  const [previewing, startPreview] = useTransition();
  const [testing, startTest] = useTransition();
  const [sending, startSend] = useTransition();

  const familyCount = `${count} famil${count === 1 ? "y" : "ies"}`;
  const noteDirty = note !== savedNote;

  const dayOptions = (() => {
    const base = [0, 1, 2, 3, 7];
    if (daysBefore != null && !base.includes(daysBefore)) base.push(daysBefore);
    return base.sort((a, b) => a - b);
  })();

  function changeSchedule(value: string) {
    const next = value === "off" ? null : Number(value);
    setDaysBefore(next);
    startSchedule(async () => {
      const res = await updateReminderSettings(eventId, { days_before: next });
      setStatus(res.error ? { kind: "err", text: res.error } : null);
    });
  }

  function saveNote() {
    startNote(async () => {
      const res = await updateReminderSettings(eventId, { note });
      if (res.error) setStatus({ kind: "err", text: res.error });
      else {
        setSavedNote(note);
        setStatus({ kind: "ok", text: "Message saved." });
      }
    });
  }

  function doPreview() {
    setStatus(null);
    startPreview(async () => {
      const res = await previewReminder(eventId, family || null, note.trim() || null);
      if (res.error) setStatus({ kind: "err", text: res.error });
      else setPreview({ subject: res.subject, html: res.html, recipients: res.recipients, bcc: res.bcc });
    });
  }

  function doTest() {
    setStatus(null);
    startTest(async () => {
      const res = await sendTestReminder(eventId, family || null, note.trim() || null);
      setStatus(
        res.error ? { kind: "err", text: res.error } : { kind: "ok", text: "Test sent to your email." }
      );
    });
  }

  function doSend() {
    if (!confirm(`Send a reminder email to ${familyCount} now?`)) return;
    setStatus(null);
    startSend(async () => {
      const res = await sendEventReminder(eventId, note.trim() || null);
      if (res.error) setStatus({ kind: "err", text: res.error });
      else
        setStatus({
          kind: "ok",
          text:
            `Sent ${res.sent} reminder${res.sent === 1 ? "" : "s"}` +
            (res.failed ? ` · ${res.failed} failed` : "") +
            (res.skipped ? ` · ${res.skipped} without an email` : ""),
        });
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Reminder email</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Each family ({familyCount}) gets one email to all their parents — you&apos;re BCC&apos;d — with
          their own who&apos;s-coming, cost breakdown, and a Venmo link if they still owe.
        </p>
      </div>

      {/* Automatic schedule */}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="reminder-when" className="text-sm text-gray-600 dark:text-gray-300">
          Send automatically:
        </label>
        <select
          id="reminder-when"
          value={daysBefore == null ? "off" : String(daysBefore)}
          onChange={(e) => changeSchedule(e.target.value)}
          disabled={savingSchedule}
          className="rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white px-3 py-1.5 text-sm"
        >
          <option value="off">Off — don&apos;t auto-send</option>
          {dayOptions.map((n) => (
            <option key={n} value={String(n)}>
              {dayLabel(n)}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-400">runs ~8am</span>
      </div>

      {/* Editable message */}
      <div>
        <label htmlFor="reminder-note" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
          Message <span className="text-gray-400">(optional — appears in every reminder)</span>
        </label>
        <textarea
          id="reminder-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="e.g. Don't forget water shoes and a towel!"
          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white px-3 py-2 text-sm"
        />
        {noteDirty && (
          <button
            type="button"
            onClick={saveNote}
            disabled={savingNote}
            className="mt-1 text-xs font-medium text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
          >
            {savingNote ? "Saving…" : "Save message for the automatic reminder"}
          </button>
        )}
      </div>

      {/* Which family to preview / test as */}
      {families.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="reminder-family" className="text-sm text-gray-600 dark:text-gray-300">
            Preview / test as:
          </label>
          <select
            id="reminder-family"
            value={family}
            onChange={(e) => setFamily(e.target.value)}
            className="max-w-full rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white px-3 py-1.5 text-sm"
          >
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={doPreview}
          disabled={previewing}
          className="inline-flex items-center rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
        >
          {previewing ? "Loading…" : preview ? "Refresh preview" : "Preview"}
        </button>
        <button
          type="button"
          onClick={doTest}
          disabled={testing}
          className="inline-flex items-center rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
        >
          {testing ? "Sending…" : "Send test to me"}
        </button>
        <button
          type="button"
          onClick={doSend}
          disabled={sending || count === 0}
          className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {sending ? "Sending…" : `Send to ${familyCount} now`}
        </button>
      </div>

      {status && (
        <p className={`text-sm ${status.kind === "err" ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
          {status.kind === "ok" ? "✓ " : ""}
          {status.text}
        </p>
      )}

      {/* Preview */}
      {preview && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="space-y-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60 px-3 py-2">
            <div>
              <p className="text-xs text-gray-400">To</p>
              {preview.recipients.length > 0 ? (
                <p className="text-sm text-gray-800 dark:text-gray-100">{preview.recipients.join(", ")}</p>
              ) : (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  No email on file for this family — they&apos;d be skipped.
                </p>
              )}
              {preview.bcc && <p className="text-xs text-gray-400">Bcc: {preview.bcc} (you)</p>}
            </div>
            <div>
              <p className="text-xs text-gray-400">Subject</p>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{preview.subject}</p>
            </div>
          </div>
          <iframe
            title="Reminder preview"
            srcDoc={preview.html}
            sandbox=""
            className="h-[520px] w-full bg-white"
          />
        </div>
      )}
    </div>
  );
}
