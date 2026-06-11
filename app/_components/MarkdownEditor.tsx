"use client";

import { useRef, useState } from "react";
import { renderMarkdown, markdownClass } from "@/lib/markdown";

export default function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 5,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  // Wrap the current selection with before/after (or insert markers).
  function surround(before: string, after: string, placeholderText = "text") {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end) || placeholderText;
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = start + before.length;
      ta.selectionEnd = start + before.length + selected.length;
    });
  }

  // Prefix each line in the selection (for lists).
  function prefixLines(prefix: string) {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const block = value.slice(lineStart, end);
    const replaced = block
      .split("\n")
      .map((l) => (l.trim() ? prefix + l : l))
      .join("\n");
    const next = value.slice(0, lineStart) + replaced + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => ta.focus());
  }

  function link() {
    const url = window.prompt("Link URL", "https://");
    if (!url) return;
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = value.slice(start, end) || "link";
    const next = value.slice(0, start) + `[${text}](${url})` + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => ta.focus());
  }

  // Insert a block at the cursor, padding with newlines so it stands alone.
  function insertBlock(text: string) {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const before = value.slice(0, start);
    const after = value.slice(start);
    const pre = before && !before.endsWith("\n") ? "\n" : "";
    const post = after && !after.startsWith("\n") ? "\n" : "";
    const next = before + pre + text + post + after;
    onChange(next);
    requestAnimationFrame(() => ta.focus());
  }

  const TABLE = "| Item | Price |\n| --- | --- |\n| Player | $12 |";

  const btn =
    "px-2 py-1 rounded text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700";

  return (
    <div className="rounded-lg border border-gray-300 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center gap-0.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-1.5 py-1">
        <button type="button" className={btn + " font-bold"} onClick={() => surround("**", "**", "bold")} title="Bold">
          B
        </button>
        <button type="button" className={btn + " italic"} onClick={() => surround("_", "_", "italic")} title="Italic">
          I
        </button>
        <button type="button" className={btn + " font-bold"} onClick={() => prefixLines("# ")} title="Title">
          H1
        </button>
        <button type="button" className={btn} onClick={() => prefixLines("## ")} title="Heading">
          H2
        </button>
        <button type="button" className={btn} onClick={() => prefixLines("- ")} title="Bulleted list">
          • List
        </button>
        <button type="button" className={btn} onClick={link} title="Link">
          🔗 Link
        </button>
        <button type="button" className={btn} onClick={() => insertBlock(TABLE)} title="Table">
          ▦ Table
        </button>
        <button type="button" className={btn} onClick={() => insertBlock("---")} title="Horizontal line">
          ― Line
        </button>
        <div className="ml-auto">
          <button
            type="button"
            className={btn + (preview ? " bg-gray-200 dark:bg-gray-700" : "")}
            onClick={() => setPreview((p) => !p)}
          >
            {preview ? "Edit" : "Preview"}
          </button>
        </div>
      </div>

      {preview ? (
        <div
          className={`px-3 py-2 min-h-[6rem] text-gray-900 dark:text-white ${markdownClass} ${className}`}
          dangerouslySetInnerHTML={{
            __html: renderMarkdown(value) || '<p class="text-gray-400">Nothing to preview.</p>',
          }}
        />
      ) : (
        <textarea
          ref={ref}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-900 focus:outline-none resize-y ${className}`}
        />
      )}
      <p className="px-3 py-1 text-[11px] text-gray-400 border-t border-gray-100 dark:border-gray-800">
        Markdown: # title, ## heading, **bold**, _italic_, - list, [text](url), tables, --- line
      </p>
    </div>
  );
}
