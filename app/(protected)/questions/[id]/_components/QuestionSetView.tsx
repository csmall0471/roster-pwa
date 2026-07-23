"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Question, QuestionSetStatus } from "@/lib/types";
import { deleteSet, setAnswer, updateSet } from "../../actions";
import AnswerCell from "./AnswerCell";
import SetSettingsPanel from "./SetSettingsPanel";

export type BoardPlayer = { id: string; name: string; jersey: string | null };
export type BoardTeam = { id: string; label: string; players: BoardPlayer[] };
export type PickerTeam = { id: string; label: string };

function keyOf(questionId: string, playerId: string) {
  return `${questionId}:${playerId}`;
}

export default function QuestionSetView({
  setId,
  initialTitle,
  initialDescription,
  initialStatus,
  allTeams,
  targetTeamIds,
  teams,
  questions,
  initialAnswers,
}: {
  setId: string;
  initialTitle: string;
  initialDescription: string;
  initialStatus: QuestionSetStatus;
  allTeams: PickerTeam[];
  targetTeamIds: string[];
  teams: BoardTeam[];
  questions: Question[];
  initialAnswers: { questionId: string; playerId: string; value: string }[];
}) {
  const router = useRouter();

  const [answers, setAnswers] = useState<Map<string, string>>(() => {
    const m = new Map<string, string>();
    for (const a of initialAnswers) m.set(keyOf(a.questionId, a.playerId), a.value);
    return m;
  });
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [status, setStatus] = useState<QuestionSetStatus>(initialStatus);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [view, setView] = useState<"team" | "question">("team");
  const [showSettings, setShowSettings] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");

  const totalKids = useMemo(() => teams.reduce((n, t) => n + t.players.length, 0), [teams]);
  const totalCells = totalKids * questions.length;
  const answeredCells = useMemo(() => {
    if (questions.length === 0) return 0;
    const qIds = new Set(questions.map((q) => q.id));
    let n = 0;
    for (const [k, v] of answers) {
      const qid = k.split(":")[0];
      if (qIds.has(qid) && v.trim() !== "") n++;
    }
    return n;
  }, [answers, questions]);

  function commit(questionId: string, playerId: string, value: string) {
    const k = keyOf(questionId, playerId);
    setAnswers((prev) => {
      const next = new Map(prev);
      if (value.trim() === "") next.delete(k);
      else next.set(k, value);
      return next;
    });
    setSaveState("saving");
    setAnswer(questionId, playerId, value)
      .then((res) => setSaveState(res.error ? "error" : "idle"))
      .catch(() => setSaveState("error"));
  }

  function saveTitle() {
    setEditingTitle(false);
    const t = title.trim();
    if (!t || t === initialTitle) {
      if (!t) setTitle(initialTitle);
      return;
    }
    updateSet(setId, { title: t }).then(() => router.refresh());
  }

  function saveDesc() {
    setEditingDesc(false);
    updateSet(setId, { description }).then(() => router.refresh());
  }

  function toggleStatus() {
    const next: QuestionSetStatus = status === "open" ? "closed" : "open";
    setStatus(next);
    updateSet(setId, { status: next });
  }

  function removeList() {
    if (!confirm("Delete this whole list and every answer in it?")) return;
    deleteSet(setId).then(() => router.push("/questions"));
  }

  const answer = (q: Question, p: BoardPlayer) => answers.get(keyOf(q.id, p.id)) ?? "";

  const noTeams = targetTeamIds.length === 0;
  const noQuestions = questions.length === 0;

  return (
    <div className="mt-2 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") {
                  setTitle(initialTitle);
                  setEditingTitle(false);
                }
              }}
              className="w-full rounded-lg border border-gray-300 px-2 py-1 text-2xl font-bold text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          ) : (
            <h1
              onClick={() => setEditingTitle(true)}
              className="cursor-text text-2xl font-bold text-gray-900 hover:opacity-80 dark:text-white"
              title="Click to rename"
            >
              {title}
            </h1>
          )}

          {editingDesc ? (
            <textarea
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={saveDesc}
              rows={2}
              placeholder="Add a description…"
              className="mt-2 w-full rounded-lg border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          ) : (
            <p
              onClick={() => setEditingDesc(true)}
              className="mt-1 cursor-text text-sm text-gray-500 hover:opacity-80 dark:text-gray-400"
              title="Click to edit"
            >
              {description || <span className="italic text-gray-400">Add a description…</span>}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={toggleStatus}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              status === "open"
                ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
            }`}
            title="Toggle open / closed"
          >
            {status}
          </button>
          <button
            type="button"
            onClick={removeList}
            className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Progress + controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowSettings((s) => !s)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            {showSettings ? "Done" : "⚙︎ Setup"}
          </button>
          {totalCells > 0 && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {answeredCells} / {totalCells} filled
              {saveState === "saving" && <span className="ml-2 text-gray-400">saving…</span>}
              {saveState === "error" && (
                <span className="ml-2 text-red-500">couldn&apos;t save — check connection</span>
              )}
            </span>
          )}
        </div>

        {!noTeams && !noQuestions && totalKids > 0 && (
          <div className="inline-flex rounded-lg border border-gray-300 p-0.5 dark:border-gray-700">
            {(["team", "question"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 text-sm font-medium ${
                  view === v
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
              >
                {v === "team" ? "By team / kid" : "By question"}
              </button>
            ))}
          </div>
        )}
      </div>

      {showSettings && (
        <SetSettingsPanel
          setId={setId}
          allTeams={allTeams}
          targetTeamIds={targetTeamIds}
          questions={questions}
        />
      )}

      {/* Empty states */}
      {noTeams ? (
        <EmptyHint>Pick the teams you want to ask in <b>Setup</b>.</EmptyHint>
      ) : totalKids === 0 ? (
        <EmptyHint>No players on the selected teams yet.</EmptyHint>
      ) : noQuestions ? (
        <EmptyHint>Add your first question in <b>Setup</b>.</EmptyHint>
      ) : view === "team" ? (
        /* ── By team / kid ─────────────────────────────────────────────── */
        <div className="space-y-6">
          {teams.map((t) => (
            <div key={t.id}>
              <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
                {t.label}{" "}
                <span className="font-normal text-gray-400">
                  ({t.players.length} player{t.players.length === 1 ? "" : "s"})
                </span>
              </h2>
              {t.players.length === 0 ? (
                <p className="text-sm text-gray-400">No players on this team.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-left dark:border-gray-800 dark:bg-gray-900/60">
                        <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 font-semibold text-gray-600 dark:bg-gray-900/60 dark:text-gray-300">
                          Player
                        </th>
                        {questions.map((q) => (
                          <th
                            key={q.id}
                            className="min-w-[9rem] px-3 py-2 font-semibold text-gray-600 dark:text-gray-300"
                          >
                            {q.prompt}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {t.players.map((p) => (
                        <tr
                          key={p.id}
                          className="border-b border-gray-100 last:border-0 dark:border-gray-800/60"
                        >
                          <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-1.5 font-medium text-gray-900 dark:bg-gray-950 dark:text-white">
                            {p.jersey ? (
                              <span className="mr-1 text-gray-400">#{p.jersey}</span>
                            ) : null}
                            {p.name}
                          </td>
                          {questions.map((q) => (
                            <td key={q.id} className="px-2 py-1.5 align-middle">
                              <AnswerCell
                                type={q.answer_type}
                                options={q.options}
                                value={answer(q, p)}
                                onCommit={(v) => commit(q.id, p.id, v)}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* ── By question ───────────────────────────────────────────────── */
        <div className="space-y-6">
          {questions.map((q) => {
            const filled = teams.reduce(
              (n, t) => n + t.players.filter((p) => answer(q, p).trim() !== "").length,
              0
            );
            return (
              <div
                key={q.id}
                className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                  <h2 className="font-semibold text-gray-900 dark:text-white">{q.prompt}</h2>
                  <span className="shrink-0 text-xs text-gray-400">
                    {filled} / {totalKids} answered
                  </span>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {teams.map((t) => (
                    <div key={t.id} className="px-4 py-3">
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                        {t.label}
                      </p>
                      <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                        {t.players.map((p) => (
                          <div key={p.id} className="flex items-center gap-3">
                            <span className="w-40 shrink-0 truncate text-sm text-gray-700 dark:text-gray-200">
                              {p.jersey ? <span className="text-gray-400">#{p.jersey} </span> : null}
                              {p.name}
                            </span>
                            <div className="flex-1">
                              <AnswerCell
                                type={q.answer_type}
                                options={q.options}
                                value={answer(q, p)}
                                onCommit={(v) => commit(q.id, p.id, v)}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
      {children}
    </div>
  );
}
