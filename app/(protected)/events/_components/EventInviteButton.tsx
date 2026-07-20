"use client";

import { useState } from "react";
import MessageComposer from "../../players/_components/MessageComposer";

type Recipient = { name: string; email: string | null; phone: string | null };

export default function EventInviteButton({
  title,
  shareUrl,
  recipients,
  teamName,
}: {
  title: string;
  shareUrl: string;
  recipients: Recipient[];
  teamName: string | null;
}) {
  const [channel, setChannel] = useState<"email" | "text" | null>(null);

  function open(ch: "email" | "text") {
    setChannel(ch);
  }

  const subject = `You're invited: ${title}`;
  const body = `Hi! You're invited to ${title}.\n\nSign up here: ${shareUrl}\n\nHope to see you there!`;

  if (recipients.length === 0) return null;

  return (
    <div>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Invite the team{teamName ? ` (${teamName})` : ""}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => open("email")}
          className="inline-flex items-center rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          ✉️ Email link ({recipients.filter((r) => r.email).length})
        </button>
        <button
          onClick={() => open("text")}
          className="inline-flex items-center rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          💬 Text link ({recipients.filter((r) => r.phone).length})
        </button>
      </div>

      {channel && (
        <MessageComposer
          recipients={recipients}
          channel={channel}
          onClose={() => setChannel(null)}
          initialSubject={subject}
          initialBody={body}
        />
      )}
    </div>
  );
}
