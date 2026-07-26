"use client";

import { useRef, useState, useTransition } from "react";
import {
  DEFAULT_TEXT_TEMPLATE,
  TEMPLATE_TOKENS,
  renderTextTemplate,
} from "../../text-template";

// Edits the per-list SMS body used by the "Text parents" button. Shows a live
// preview built from the list's real questions so the coach sees exactly what
// a parent will get.
export default function MessageTemplateEditor({
  value,
  sampleQuestions,
  onSave,
}: {
  value: string;
  sampleQuestions: string[];
  onSave: (template: string) => Promise<{ error?: string }>;
}) {
  const initial = value || DEFAULT_TEXT_TEMPLATE;
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const taRef = useRef<HTMLTextAreaElement>(null);

  const dirty = draft !== saved;

  function insert(token: string) {
    const ta = taRef.current;
    if (!ta) {
      setDraft((d) => d + token);
      return;
    }
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    setDraft((d) => d.slice(0, s) + token + d.slice(e));
    requestAnimationFrame(() => {
      ta.focus();
      const pos = s + token.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await onSave(draft);
      if (res.error) setError(res.error);
      else setSaved(draft);
    });
  }

  const previewPrompts =
    sampleQuestions.length > 0
      ? sampleQuestions.slice(0, 3)
      : ["Jersey # for next season?", "Shirt size?"];
  const preview = renderTextTemplate(draft, { player: "Ben", prompts: previewPrompts });

  return (
    <div className="space-y-2">
      <textarea
        ref={taRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={4}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-gray-400 dark:text-gray-500">Insert:</span>
        {TEMPLATE_TOKENS.map((t) => (
          <button
            key={t.token}
            type="button"
            onClick={() => insert(t.token)}
            title={t.hint}
            className="rounded-full border border-gray-300 px-2 py-0.5 font-mono text-xs text-gray-600 hover:bg-white dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-900"
          >
            {t.token}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setDraft(DEFAULT_TEXT_TEMPLATE)}
          className="ml-auto text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          Reset to default
        </button>
      </div>

      {/* Live preview */}
      <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
        <p className="mb-1 text-xs font-medium text-gray-400 dark:text-gray-500">
          Preview (for Ben)
        </p>
        <p className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-100">{preview}</p>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || busy}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save message"}
        </button>
        {!dirty && !busy && saved !== DEFAULT_TEXT_TEMPLATE && (
          <span className="text-xs text-gray-400">Saved</span>
        )}
      </div>
    </div>
  );
}
