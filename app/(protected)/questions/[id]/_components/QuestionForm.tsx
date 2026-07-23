"use client";

import { useState, useTransition } from "react";
import type { QuestionAnswerType } from "@/lib/types";

export type QuestionDraft = {
  prompt: string;
  help_text: string;
  answer_type: QuestionAnswerType;
  options: string[];
};

const TYPE_LABELS: { value: QuestionAnswerType; label: string; hint: string }[] = [
  { value: "text", label: "Text", hint: "any short answer" },
  { value: "number", label: "Number", hint: "e.g. jersey #" },
  { value: "select", label: "Dropdown", hint: "pick from choices" },
  { value: "bool", label: "Yes / No", hint: "" },
];

export default function QuestionForm({
  initial,
  submitLabel,
  onSave,
  onCancel,
}: {
  initial?: QuestionDraft;
  submitLabel: string;
  onSave: (draft: QuestionDraft) => Promise<{ error?: string }>;
  onCancel: () => void;
}) {
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [helpText, setHelpText] = useState(initial?.help_text ?? "");
  const [type, setType] = useState<QuestionAnswerType>(initial?.answer_type ?? "text");
  const [optionsText, setOptionsText] = useState((initial?.options ?? []).join("\n"));
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function submit() {
    setError(null);
    const options = optionsText
      .split("\n")
      .map((o) => o.trim())
      .filter(Boolean);
    start(async () => {
      const res = await onSave({ prompt, help_text: helpText, answer_type: type, options });
      if (res.error) setError(res.error);
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
      <div>
        <input
          autoFocus
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Question (e.g. Jersey # for next season?)"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TYPE_LABELS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              type === t.value
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-gray-300 text-gray-600 hover:bg-white dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-900"
            }`}
            title={t.hint}
          >
            {t.label}
          </button>
        ))}
      </div>

      {type === "select" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
            Choices (one per line)
          </label>
          <textarea
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            rows={4}
            placeholder={"YS\nYM\nYL\nAdult S"}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          />
        </div>
      )}

      <input
        value={helpText}
        onChange={(e) => setHelpText(e.target.value)}
        placeholder="Note to yourself (optional)"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
      />

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy || !prompt.trim()}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}
