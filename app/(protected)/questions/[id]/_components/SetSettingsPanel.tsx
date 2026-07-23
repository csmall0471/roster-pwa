"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Question } from "@/lib/types";
import {
  addQuestion,
  deleteQuestion,
  setSetTeams,
  updateQuestion,
} from "../../actions";
import QuestionForm, { type QuestionDraft } from "./QuestionForm";
import type { PickerTeam } from "./QuestionSetView";

const TYPE_BADGE: Record<string, string> = {
  text: "Text",
  number: "Number",
  select: "Dropdown",
  bool: "Yes / No",
};

export default function SetSettingsPanel({
  setId,
  allTeams,
  targetTeamIds,
  questions,
}: {
  setId: string;
  allTeams: PickerTeam[];
  targetTeamIds: string[];
  questions: Question[];
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set(targetTeamIds));
  const [teamBusy, startTeams] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function toggleTeam(id: string) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
    startTeams(async () => {
      await setSetTeams(setId, [...next]);
      router.refresh();
    });
  }

  async function handleAdd(draft: QuestionDraft) {
    const res = await addQuestion(setId, draft);
    if (res.error) return res;
    setAdding(false);
    router.refresh();
    return {};
  }

  async function handleEdit(id: string, draft: QuestionDraft) {
    const res = await updateQuestion(id, draft);
    if (res.error) return res;
    setEditingId(null);
    router.refresh();
    return {};
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this question and all its answers?")) return;
    await deleteQuestion(id);
    router.refresh();
  }

  return (
    <div className="space-y-6 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      {/* Teams */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Teams to ask {teamBusy && <span className="ml-1 font-normal normal-case text-gray-400">saving…</span>}
        </h3>
        {allTeams.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">You don&apos;t have any teams yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {allTeams.map((t) => {
              const on = picked.has(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTeam(t.id)}
                  className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                    on
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                  }`}
                >
                  {on ? "✓ " : ""}
                  {t.label}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Questions */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Questions
        </h3>
        {questions.length === 0 && !adding && (
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">No questions yet.</p>
        )}

        <ul className="space-y-2">
          {questions.map((q) =>
            editingId === q.id ? (
              <li key={q.id}>
                <QuestionForm
                  submitLabel="Save changes"
                  initial={{
                    prompt: q.prompt,
                    help_text: q.help_text ?? "",
                    answer_type: q.answer_type,
                    options: q.options,
                  }}
                  onSave={(draft) => handleEdit(q.id, draft)}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li
                key={q.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{q.prompt}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {TYPE_BADGE[q.answer_type] ?? q.answer_type}
                    {q.answer_type === "select" && q.options.length > 0 && ` · ${q.options.join(", ")}`}
                    {q.help_text ? ` · ${q.help_text}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => setEditingId(q.id)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(q.id)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
                  >
                    Delete
                  </button>
                </div>
              </li>
            )
          )}
        </ul>

        <div className="mt-3">
          {adding ? (
            <QuestionForm submitLabel="Add question" onSave={handleAdd} onCancel={() => setAdding(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              + Add question
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
