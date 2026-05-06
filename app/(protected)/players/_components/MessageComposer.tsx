"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { draftMessage } from "../message-actions";
import { createGmailDraft } from "../gmail-actions";

type Recipient = { name: string; email: string | null; phone: string | null };
type TeamContext = { name: string; organization?: string | null; season?: string | null };

export default function MessageComposer({
  recipients,
  channel,
  onClose,
  teamContext,
}: {
  recipients: Recipient[];
  channel: "email" | "text";
  onClose: () => void;
  teamContext?: TeamContext;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [drafting, startDraft] = useTransition();
  const [sending, startSend] = useTransition();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const emails = recipients.flatMap((r) => (r.email ? [r.email] : []));
  const phones = recipients.flatMap((r) => (r.phone ? [r.phone] : []));

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function handleDraft() {
    if (!aiPrompt.trim()) return;
    startDraft(async () => {
      const result = await draftMessage(aiPrompt.trim(), channel);
      if (result.channel === "email") {
        setSubject(result.subject);
        setBody(result.body);
      } else {
        setBody(result.body);
      }
      bodyRef.current?.focus();
    });
  }

  function handleGmailDraft() {
    setGmailError(null);
    startSend(async () => {
      const result = await createGmailDraft({
        bcc: emails,
        subject,
        body,
        teamName: teamContext?.name,
        organization: teamContext?.organization,
        season: teamContext?.season,
      });
      if ("error" in result) {
        setGmailError(result.error);
      } else {
        window.open(result.draftUrl, "_blank", "noopener,noreferrer");
        onClose();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white">
              {channel === "email" ? "Email parents" : "Text parents"}
            </h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {channel === "email"
                ? `${emails.length} email address${emails.length !== 1 ? "es" : ""}`
                : `${phones.length} phone number${phones.length !== 1 ? "s" : ""}`}
              {" · "}
              {recipients.length} recipient{recipients.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Recipients preview */}
          <div>
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">
              Recipients
            </p>
            <div className="flex flex-wrap gap-1.5">
              {recipients.map((r, i) => (
                <span
                  key={i}
                  className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full px-2.5 py-1"
                >
                  {r.name}
                </span>
              ))}
            </div>
            {channel === "email" && emails.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">No email addresses on file for these parents.</p>
            )}
            {channel === "text" && phones.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">No phone numbers on file for these parents.</p>
            )}
          </div>

          {/* AI draft row */}
          <div>
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">
              Draft with AI
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={
                  channel === "email"
                    ? "e.g. Practice moved to Saturday due to rain"
                    : "e.g. Game tomorrow at 9am, bring water"
                }
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleDraft()}
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={handleDraft}
                disabled={drafting || !aiPrompt.trim()}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {drafting ? "Writing…" : "Write"}
              </button>
            </div>
          </div>

          {/* Subject (email only) */}
          {channel === "email" && (
            <div>
              <label className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide block mb-1.5">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject line"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                Message
              </label>
              {channel === "text" && (
                <span
                  className={`text-xs tabular-nums ${
                    body.length > 160 ? "text-amber-600 dark:text-amber-400" : "text-gray-400 dark:text-gray-500"
                  }`}
                >
                  {body.length} chars
                </span>
              )}
            </div>
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={channel === "email" ? "Message body…" : "Text message…"}
              rows={channel === "email" ? 7 : 4}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none resize-none"
            />
          </div>

          {/* Phone numbers (text only) */}
          {channel === "text" && phones.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">
                Phone numbers
              </p>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-xs font-mono text-gray-700 dark:text-gray-300 break-all leading-relaxed">
                {phones.join(", ")}
              </div>
              <button
                onClick={() => copy(phones.join(", "), "phones")}
                className="mt-1.5 text-xs text-blue-600 hover:underline"
              >
                {copied === "phones" ? "Copied!" : "Copy all numbers"}
              </button>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 space-y-3">
          {gmailError && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
              {gmailError}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={onClose}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              Cancel
            </button>

            <div className="flex gap-2">
              {channel === "text" && (
                <button
                  onClick={() => copy(body, "message")}
                  disabled={!body}
                  className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors"
                >
                  {copied === "message" ? "Copied!" : "Copy message"}
                </button>
              )}
              {channel === "email" && emails.length > 0 && (
                <button
                  onClick={handleGmailDraft}
                  disabled={sending || !subject || !body}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {sending ? "Creating draft…" : "Create Gmail draft →"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
