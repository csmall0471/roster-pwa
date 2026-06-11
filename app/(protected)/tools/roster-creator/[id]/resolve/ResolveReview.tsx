"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  applyResolution,
  runClaudePass,
  type SuggestedBuddyLink,
} from "../../actions";
import type { EntityProposal, Proposal } from "../../resolve/engine";

function Badge({ kind }: { kind: "high" | "review" | "low" | "reciprocal" }) {
  const styles: Record<string, string> = {
    high: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    review: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    low: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    reciprocal: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  };
  const label = { high: "confident", review: "review", low: "low confidence", reciprocal: "mutual" }[kind];
  return <span className={`ml-2 text-[10px] uppercase tracking-wide rounded-full px-1.5 py-0.5 ${styles[kind]}`}>{label}</span>;
}

export default function ResolveReview({
  seasonId,
  proposal,
  playerCount,
}: {
  seasonId: string;
  proposal: Proposal;
  playerCount: number;
}) {
  const router = useRouter();

  // Claude can replace the coach/team clusters with reviewed groupings.
  const [refinedCoaches, setRefinedCoaches] = useState<EntityProposal[] | null>(null);
  const [refinedTeams, setRefinedTeams] = useState<EntityProposal[] | null>(null);
  const activeCoaches = refinedCoaches ?? proposal.coaches;
  const activeTeams = refinedTeams ?? proposal.teams;

  const [coachOn, setCoachOn] = useState<Set<number>>(() => new Set(proposal.coaches.map((_, i) => i)));
  const [teamOn, setTeamOn] = useState<Set<number>>(() => new Set(proposal.teams.map((_, i) => i)));

  const resolvedBuddies = proposal.buddies.filter((b) => b.toId !== null);
  const unresolvedBuddies = proposal.buddies.filter((b) => b.toId === null);
  const [buddyOn, setBuddyOn] = useState<Set<number>>(
    () =>
      new Set(
        resolvedBuddies
          .map((b, i) => ({ b, i }))
          .filter(({ b }) => b.confidence === "high" || b.reciprocal)
          .map(({ i }) => i)
      )
  );

  // Claude-suggested buddy links (for the fuzzy-unresolved requests).
  const [aiLinks, setAiLinks] = useState<SuggestedBuddyLink[]>([]);
  const [aiOn, setAiOn] = useState<Set<number>>(new Set());

  const [claudeBusy, setClaudeBusy] = useState(false);
  const [claudeRan, setClaudeRan] = useState(false);
  const [claudeError, setClaudeError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function toggle(set: Set<number>, setter: (s: Set<number>) => void, i: number) {
    const next = new Set(set);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setter(next);
    setDone(false);
  }

  async function runClaude() {
    setClaudeBusy(true);
    setClaudeError(null);
    try {
      const res = await runClaudePass(seasonId);
      if (res.error) setClaudeError(res.error);
      if (res.coaches.length) {
        setRefinedCoaches(res.coaches);
        setCoachOn(new Set(res.coaches.map((_, i) => i)));
      }
      if (res.teams.length) {
        setRefinedTeams(res.teams);
        setTeamOn(new Set(res.teams.map((_, i) => i)));
      }
      setAiLinks(res.buddyLinks);
      setAiOn(new Set(res.buddyLinks.map((_, i) => i)));
      setClaudeRan(true);
      setDone(false);
    } catch (e) {
      setClaudeError(e instanceof Error ? e.message : "Claude request failed.");
    } finally {
      setClaudeBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      await applyResolution(seasonId, {
        coaches: [...coachOn].map((i) => ({
          canonical: activeCoaches[i].canonical,
          playerIds: activeCoaches[i].playerIds,
        })),
        teams: [...teamOn].map((i) => ({
          canonical: activeTeams[i].canonical,
          playerIds: activeTeams[i].playerIds,
        })),
        buddyLinks: [
          ...[...buddyOn].map((i) => ({
            fromId: resolvedBuddies[i].fromId,
            toId: resolvedBuddies[i].toId as string,
          })),
          ...[...aiOn].map((i) => ({ fromId: aiLinks[i].fromId, toId: aiLinks[i].toId })),
        ],
      });
      setDone(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply resolution.");
    } finally {
      setBusy(false);
    }
  }

  const reviewCoaches = activeCoaches.filter((c) => c.confidence === "review").length;

  return (
    <div className="space-y-8">
      {/* Claude pass */}
      <div className="flex items-center gap-3 rounded-lg border border-purple-200 dark:border-purple-900/50 bg-purple-50/40 dark:bg-purple-950/20 px-4 py-3">
        <button
          type="button"
          onClick={runClaude}
          disabled={claudeBusy}
          className="inline-flex items-center rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {claudeBusy ? "Running Claude pass…" : claudeRan ? "Re-run Claude pass" : "Run Claude pass"}
        </button>
        <p className="text-xs text-gray-600 dark:text-gray-300">
          Uses Claude to review borderline coach/team merges and match the buddy requests fuzzy
          matching missed. Suggestions only — you still confirm below.
        </p>
        {claudeError && <span className="ml-auto text-xs text-red-600 dark:text-red-400">{claudeError}</span>}
      </div>

      <ClusterSection
        title="Coaches"
        subtitle={
          (refinedCoaches ? "Claude-reviewed · " : "") +
          `${activeCoaches.length} groups` +
          (reviewCoaches ? ` · ${reviewCoaches} need review` : "")
        }
        clusters={activeCoaches}
        on={coachOn}
        onToggle={(i) => toggle(coachOn, setCoachOn, i)}
      />

      <ClusterSection
        title="Team names"
        subtitle={(refinedTeams ? "Claude-reviewed · " : "") + `${activeTeams.length} groups`}
        clusters={activeTeams}
        on={teamOn}
        onToggle={(i) => toggle(teamOn, setTeamOn, i)}
      />

      {/* Buddy links */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
          Buddy / family links
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          {resolvedBuddies.length} matched by fuzzy · {unresolvedBuddies.length} unmatched
          {aiLinks.length > 0 && ` · ${aiLinks.length} matched by Claude`}
        </p>
        <ul className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
          {resolvedBuddies.map((b, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
              <input type="checkbox" checked={buddyOn.has(i)} onChange={() => toggle(buddyOn, setBuddyOn, i)} />
              <span className="text-gray-900 dark:text-white">
                {b.fromName} → {b.toName}
              </span>
              {b.reciprocal && <Badge kind="reciprocal" />}
              {b.confidence === "low" && <Badge kind="low" />}
              <span className="ml-auto text-xs text-gray-400">{b.score.toFixed(2)}</span>
            </li>
          ))}
        </ul>

        {aiLinks.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-2">
              Claude-suggested matches
            </h3>
            <ul className="rounded-lg border border-purple-200 dark:border-purple-900/50 bg-purple-50/40 dark:bg-purple-950/20 divide-y divide-purple-100 dark:divide-purple-900/30">
              {aiLinks.map((l, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <input type="checkbox" checked={aiOn.has(i)} onChange={() => toggle(aiOn, setAiOn, i)} />
                  <span className="text-gray-900 dark:text-white">
                    {l.fromName} → {l.toName}
                  </span>
                  <span className="ml-auto text-xs text-gray-400 italic truncate max-w-[40%]">
                    from &quot;{l.rawName}&quot;
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {unresolvedBuddies.length > 0 && (
          <details className="mt-3">
            <summary className="text-sm font-medium text-amber-600 dark:text-amber-400 cursor-pointer">
              {unresolvedBuddies.length} still unmatched{claudeRan ? "" : " — try the Claude pass"}
            </summary>
            <ul className="mt-2 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 divide-y divide-amber-100 dark:divide-amber-900/30">
              {unresolvedBuddies.map((b, i) => (
                <li key={i} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-medium">{b.fromName}</span> wanted{" "}
                  <span className="italic">&quot;{b.rawName}&quot;</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* Cross-division flags */}
      {proposal.crossFlags.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Possible wrong division
          </h2>
          <ul className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 divide-y divide-amber-100 dark:divide-amber-900/30">
            {proposal.crossFlags.map((f, i) => (
              <li key={i} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                <span className="font-medium">{f.name}</span> enrolled U{f.enrolledAge}, but request
                mentions U{f.hintedAge}. Move them on the{" "}
                <a href={`/tools/roster-creator/${seasonId}`} className="text-blue-600 dark:text-blue-400 underline">
                  season page
                </a>
                .
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex items-center gap-3 sticky bottom-0 bg-gray-50 dark:bg-gray-950 py-3">
        <button
          type="button"
          onClick={apply}
          disabled={busy}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Applying…" : "Apply resolution"}
        </button>
        {done && <span className="text-sm text-green-600 dark:text-green-400">Saved — {playerCount} players resolved</span>}
      </div>
    </div>
  );
}

function ClusterSection({
  title,
  subtitle,
  clusters,
  on,
  onToggle,
}: {
  title: string;
  subtitle: string;
  clusters: EntityProposal[];
  on: Set<number>;
  onToggle: (i: number) => void;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{title}</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{subtitle}</p>
      <ul className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
        {clusters.map((c, i) => (
          <li key={i} className="flex items-start gap-3 px-4 py-2 text-sm">
            <input type="checkbox" className="mt-1" checked={on.has(i)} onChange={() => onToggle(i)} />
            <div className="min-w-0">
              <span className="font-medium text-gray-900 dark:text-white">{c.canonical}</span>
              <span className="ml-2 text-xs text-gray-400">×{c.playerIds.length}</span>
              {c.confidence === "review" && <Badge kind="review" />}
              {c.variants.length > 1 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">merged: {c.variants.join(" · ")}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
