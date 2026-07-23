"use client";

import { useEffect, useRef, useState } from "react";
import type { QuestionAnswerType } from "@/lib/types";

// A single editable answer. Commits on blur (text/number) or immediately
// (select/bool). The parent owns the value and persistence; this cell only
// surfaces edits via onCommit and mirrors the value it's given.
export default function AnswerCell({
  type,
  options,
  value,
  onCommit,
}: {
  type: QuestionAnswerType;
  options: string[];
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);

  // Reflect external changes when we're not the one editing.
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  const empty = value.trim() === "";

  if (type === "select") {
    return (
      <select
        value={value}
        onChange={(e) => onCommit(e.target.value)}
        className={`w-full rounded-md border px-2 py-1 text-sm ${
          empty
            ? "border-gray-200 bg-transparent text-gray-400 dark:border-gray-700"
            : "border-transparent bg-blue-50 text-gray-900 dark:bg-blue-900/30 dark:text-white"
        }`}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  if (type === "bool") {
    const set = (v: string) => onCommit(value === v ? "" : v);
    return (
      <div className="flex gap-1">
        {["Yes", "No"].map((opt) => {
          const active = value.toLowerCase() === opt.toLowerCase();
          return (
            <button
              key={opt}
              type="button"
              onClick={() => set(opt)}
              className={`flex-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                active
                  ? opt === "Yes"
                    ? "border-green-600 bg-green-600 text-white"
                    : "border-gray-500 bg-gray-500 text-white"
                  : "border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    );
  }

  // text / number
  return (
    <input
      type={type === "number" ? "text" : "text"}
      inputMode={type === "number" ? "numeric" : undefined}
      value={draft}
      onFocus={() => (focused.current = true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        focused.current = false;
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder="—"
      className={`w-full rounded-md border px-2 py-1 text-sm ${
        empty
          ? "border-gray-200 bg-transparent text-gray-900 placeholder:text-gray-300 dark:border-gray-700 dark:text-white"
          : "border-transparent bg-blue-50 text-gray-900 dark:bg-blue-900/30 dark:text-white"
      }`}
    />
  );
}
