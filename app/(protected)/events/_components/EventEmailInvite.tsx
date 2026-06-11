"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendEventInvites } from "../actions";

export default function EventEmailInvite({
  eventId,
  emailCount,
}: {
  eventId: string;
  emailCount: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function send() {
    if (!confirm(`Send the event invite email to ${emailCount} parent${emailCount === 1 ? "" : "s"}?`))
      return;
    setResult(null);
    start(async () => {
      const res = await sendEventInvites(eventId);
      if (res.error) setResult(res.error);
      else setResult(`Sent ${res.sent}${res.failed ? `, ${res.failed} failed` : ""}.`);
      router.refresh();
    });
  }

  if (emailCount === 0) return null;

  return (
    <div>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email invite (tracked)</p>
      <div className="flex items-center gap-3">
        <button
          onClick={send}
          disabled={pending}
          className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Sending…" : `✉️ Email the team (${emailCount})`}
        </button>
        {result && <span className="text-sm text-gray-500 dark:text-gray-400">{result}</span>}
      </div>
      <p className="mt-1 text-xs text-gray-400">
        Sends the signup link via email and records who was invited. Re-sending updates their invite.
      </p>
    </div>
  );
}
