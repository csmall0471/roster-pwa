"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setEventStatus, deleteEvent } from "../actions";
import type { EventStatus } from "@/lib/types";

export default function EventManageControls({
  eventId,
  shareUrl,
  status,
}: {
  eventId: string;
  shareUrl: string;
  status: EventStatus;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);

  function changeStatus(next: EventStatus) {
    start(async () => {
      await setEventStatus(eventId, next);
      router.refresh();
    });
  }

  function copy() {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function remove() {
    if (!confirm("Delete this event and all its signups? This cannot be undone.")) return;
    start(async () => {
      await deleteEvent(eventId);
      router.push("/events");
    });
  }

  const isPublished = status === "published";

  return (
    <div className="space-y-4">
      {/* Publish state */}
      <div className="flex flex-wrap items-center gap-2">
        {status !== "published" && (
          <button
            onClick={() => changeStatus("published")}
            disabled={pending}
            className="inline-flex items-center rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            Publish
          </button>
        )}
        {status === "published" && (
          <button
            onClick={() => changeStatus("closed")}
            disabled={pending}
            className="inline-flex items-center rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            Close signups
          </button>
        )}
        {status === "closed" && (
          <button
            onClick={() => changeStatus("published")}
            disabled={pending}
            className="inline-flex items-center rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            Reopen
          </button>
        )}
        <a
          href={`/events/${eventId}/edit`}
          className="inline-flex items-center rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Edit
        </a>
        <button
          onClick={remove}
          disabled={pending}
          className="inline-flex items-center rounded-lg border border-red-300 dark:border-red-800 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
        >
          Delete
        </button>
      </div>

      {/* Share link */}
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Share link</p>
        {isPublished ? (
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={shareUrl}
              onFocus={(e) => e.target.select()}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
            />
            <button
              onClick={copy}
              className="shrink-0 inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Publish the event to get a shareable link.
          </p>
        )}
      </div>
    </div>
  );
}
