"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AnalyzeResult } from "../../analyze";

const shortDiv = (name: string) => name.replace(/^Peoria\s+/i, "");

type Phase = "idle" | "running" | "done" | "error";

function fmtTime(secs: number): string {
  if (!isFinite(secs) || secs < 0) return "—";
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function ConfirmView({
  seasonId,
  autoRun,
}: {
  seasonId: string;
  autoRun: boolean;
}) {
  const [phase, setPhase] = useState<Phase>(autoRun ? "running" : "idle");
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const esRef = useRef<EventSource | null>(null);
  const finished = useRef(false);
  const startedAt = useRef(0);

  function run() {
    esRef.current?.close();
    finished.current = false;
    startedAt.current = Date.now();
    setPhase("running");
    setError(null);
    setElapsed(0);
    setDone(0);
    setTotal(0);

    const es = new EventSource(`/tools/roster-creator/${seasonId}/analyze`);
    esRef.current = es;
    const isCurrent = () => esRef.current === es; // ignore events from superseded streams

    es.addEventListener("progress", (e) => {
      if (!isCurrent()) return;
      const d = JSON.parse((e as MessageEvent).data) as { done: number; total: number };
      setDone(d.done);
      setTotal(d.total);
    });
    es.addEventListener("result", (e) => {
      if (!isCurrent()) return;
      finished.current = true;
      es.close();
      const res = JSON.parse((e as MessageEvent).data) as AnalyzeResult;
      if (res.error) {
        setError(res.error);
        setPhase("error");
      } else {
        setResult(res);
        setPhase("done");
      }
    });
    es.addEventListener("failed", (e) => {
      if (!isCurrent()) return;
      finished.current = true;
      es.close();
      const d = JSON.parse((e as MessageEvent).data) as { message: string };
      setError(d.message);
      setPhase("error");
    });
    es.onerror = () => {
      if (!isCurrent() || finished.current) return;
      es.close();
      setError("Lost connection to the analysis. Please try again.");
      setPhase("error");
    };
  }

  // Open the stream on mount; close it on unmount. Under React StrictMode the
  // throwaway first mount opens+closes a stream (its run is aborted server-side,
  // cheap), then the real mount opens the live one.
  useEffect(() => {
    if (autoRun) queueMicrotask(run);
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 500);
    return () => clearInterval(t);
  }, [phase]);

  if (phase === "running") {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const rate = done > 0 ? elapsed / done : 0; // sec per player
    const eta = rate > 0 && total > 0 ? rate * (total - done) : NaN;
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="text-sm font-medium text-gray-900 dark:text-white">Analyzing signups with Claude…</p>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
          <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${total > 0 ? pct : 8}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>
            {total > 0 ? `${done} / ${total} players (${pct}%)` : "Starting…"}
          </span>
          <span>
            {fmtTime(elapsed)} elapsed{total > 0 && done > 0 ? ` · ~${fmtTime(eta)} left` : ""}
          </span>
        </div>
      </div>
    );
  }

  if (phase === "idle") {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          This season has already been analyzed. Re-run to review what Claude flagged, or continue.
        </p>
        <div className="mt-4 flex gap-3">
          <button type="button" onClick={run} className="inline-flex items-center rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700">
            Re-run analysis
          </button>
          <Link href={`/tools/roster-creator/${seasonId}/teams`} className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            Build teams →
          </Link>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 p-6">
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        <button type="button" onClick={run} className="mt-4 inline-flex items-center rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700">
          Try again
        </button>
      </div>
    );
  }

  const r = result!;
  const flaggedAll = r.pairings.flatMap((d) =>
    d.teams.filter((t) => t.needsReview).map((t) => ({ division: d.division, ...t }))
  );
  const flagged = flaggedAll.filter((t) => !dismissed.has(`${t.division}::${t.name}`));

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="rounded-lg border border-green-200 dark:border-green-900/50 bg-green-50/50 dark:bg-green-950/20 p-4">
        <p className="text-sm font-semibold text-green-800 dark:text-green-300">Applied automatically</p>
        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
          {r.summary.players} players · {r.summary.divisions} divisions · {r.summary.teams} teams ·{" "}
          {r.summary.coaches} coaches · {r.summary.buddyLinks} buddy links.
        </p>
      </div>

      {/* Only the things we're not confident about */}
      {flagged.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            Double-check these ({flagged.length})
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            We matched each player&rsquo;s request to a coach on your roster. The teams below drew a player we
            couldn&rsquo;t pin to a <strong>single</strong> coach — usually two coaches share a surname (e.g. two
            Wilsons), so we made a best guess. Skim each one: if it looks right, hit <em>Looks right</em> to
            clear it. To move someone, drag them on the Build-teams board — it won&rsquo;t hurt anything here.
          </p>
          <ul className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 divide-y divide-amber-100 dark:divide-amber-900/30">
            {flagged.map((t, i) => (
              <li key={i} className="flex items-start justify-between gap-3 px-4 py-2 text-sm">
                <div className="min-w-0">
                  <span className="text-gray-900 dark:text-white font-medium">{t.name}</span>
                  {t.coach && <span className="text-xs text-gray-500 dark:text-gray-400"> · {t.coach}</span>}
                  <span className="ml-2 text-xs text-gray-400">{shortDiv(t.division)} · {t.count}</span>
                  {t.variants.length > 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      players to check: {t.variants.map((v) => `“${v}”`).join(" · ")}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setDismissed((s) => new Set(s).add(`${t.division}::${t.name}`))}
                  className="shrink-0 text-xs font-semibold text-green-700 dark:text-green-400 hover:underline"
                >
                  Looks right
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Coach requests that matched no one on the roster */}
      {r.unmatchedCoaches.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            Requests we couldn&rsquo;t match ({r.unmatchedCoaches.length})
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            These players asked for a coach who isn&rsquo;t on your roster for their division, so the request
            can&rsquo;t be honored — they&rsquo;ll be placed onto an open team when you build. Check for a typo in
            the coach list, or just let the balancer seat them.
          </p>
          <ul className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800 max-h-64 overflow-y-auto">
            {r.unmatchedCoaches.map((u, i) => (
              <li key={i} className="flex items-start justify-between gap-3 px-4 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-gray-900 dark:text-white">{u.playerName}</span>
                  <span className="ml-2 text-xs text-gray-400">{shortDiv(u.division)}</span>
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 text-right shrink-0">
                  asked for {u.requested.map((c) => `“${c}”`).join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Teams by division — collapsed; expand to inspect */}
      <section>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Teams by division</h2>
        <div className="space-y-2">
          {r.pairings.map((d) => (
            <details key={d.division} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
              <summary className="flex items-center justify-between gap-3 px-4 py-2.5 cursor-pointer">
                <span className="font-semibold text-gray-900 dark:text-white">{d.division}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {d.teams.length} teams · {d.total} players
                </span>
              </summary>
              <ul className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                {d.teams.map((t, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium text-gray-900 dark:text-white">{t.name}</span>
                      {t.coach && <span className="text-xs text-gray-500 dark:text-gray-400"> · {t.coach}</span>}
                      {t.needsReview && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5">
                          check
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">{t.count}</span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3 sticky bottom-0 bg-gray-50 dark:bg-gray-950 py-3">
        <Link href={`/tools/roster-creator/${seasonId}/teams`} className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          Build teams →
        </Link>
        <button type="button" onClick={run} className="text-sm font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
          Re-run analysis
        </button>
      </div>
    </div>
  );
}

