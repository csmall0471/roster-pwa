"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  analyzeJsonImport,
  applyJsonImport,
  type ImportPlan,
  type PlanItem,
  type Incoming,
  type CreateInstruction,
  type UpdateInstruction,
  type ApplyResult,
} from "./actions";

type Team = { id: string; name: string; season: string };

const PLAYER_KEYS = ["first_name", "last_name", "shirt_size", "gender", "weight"] as const;

function incomingValue(inc: Incoming, key: string): string | number | null {
  switch (key) {
    case "first_name": return inc.first_name;
    case "last_name": return inc.last_name;
    case "shirt_size": return inc.shirt_size;
    case "gender": return inc.gender;
    case "weight": return inc.weight;
    default: return null;
  }
}

export default function ImportJsonClient({ teams }: { teams: Team[] }) {
  const [raw, setRaw] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [analyzeErr, setAnalyzeErr] = useState<string | null>(null);

  // decisions
  const [createOn, setCreateOn] = useState<Record<string, boolean>>({});
  const [diffOn, setDiffOn] = useState<Record<string, Record<string, boolean>>>({});
  const [teamId, setTeamId] = useState("");

  const [result, setResult] = useState<ApplyResult | null>(null);
  const [analyzing, startAnalyze] = useTransition();
  const [applying, startApply] = useTransition();

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    f.text().then(setRaw);
  }

  function runAnalyze() {
    setAnalyzeErr(null);
    setResult(null);
    startAnalyze(async () => {
      const p = await analyzeJsonImport(raw);
      if (p.items.length === 0) {
        setAnalyzeErr(p.errors.join(" ") || "No player records found in that JSON.");
        return;
      }
      // seed decisions
      const c: Record<string, boolean> = {};
      const d: Record<string, Record<string, boolean>> = {};
      for (const item of p.items) {
        if (item.status === "create") c[item.key] = true;
        if (item.status === "update") {
          d[item.key] = {};
          for (const df of item.diffs) d[item.key][df.key] = !df.conflict; // safe fills on, conflicts off
        }
      }
      setCreateOn(c);
      setDiffOn(d);
      setPlan(p);
    });
  }

  function buildPayload() {
    if (!plan) return { creates: [], updates: [], teamId: teamId || null };
    const creates: CreateInstruction[] = [];
    const updates: UpdateInstruction[] = [];

    for (const item of plan.items) {
      if (item.status === "create" && createOn[item.key]) {
        const inc = item.incoming;
        creates.push({
          externalId: inc.externalId || null,
          first_name: inc.first_name,
          last_name: inc.last_name,
          shirt_size: inc.shirt_size,
          gender: inc.gender,
          weight: inc.weight,
          parent: inc.parent,
        });
      }
      if (item.status === "update") {
        const approved = diffOn[item.key] ?? {};
        const inc = item.incoming;
        const player: UpdateInstruction["player"] = {};
        for (const k of PLAYER_KEYS) {
          if (approved[k]) (player as Record<string, unknown>)[k] = incomingValue(inc, k);
        }
        let parentUpdate: UpdateInstruction["parentUpdate"] = null;
        if (item.parentMatchId && inc.parent) {
          const pf: { parentId: string; first_name?: string; last_name?: string; phone?: string; email?: string } = {
            parentId: item.parentMatchId,
          };
          if (approved["parent.name"]) { pf.first_name = inc.parent.first_name; pf.last_name = inc.parent.last_name; }
          if (approved["parent.phone"]) pf.phone = inc.parent.phone;
          if (approved["parent.email"]) pf.email = inc.parent.email;
          if (Object.keys(pf).length > 1) parentUpdate = pf;
        }
        const parentLink = approved["parent.link"] && inc.parent ? inc.parent : null;
        const backfill = item.backfillExternal ? inc.externalId : null;

        if (Object.keys(player).length || parentUpdate || parentLink || backfill) {
          updates.push({
            playerId: item.playerId!,
            externalId: backfill,
            player,
            parentUpdate,
            parentLink,
          });
        }
      }
    }
    return { creates, updates, teamId: teamId || null };
  }

  function runApply() {
    const payload = buildPayload();
    startApply(async () => {
      const r = await applyJsonImport(payload);
      setResult(r);
    });
  }

  // ── Result screen ──
  if (result) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-5 py-4 text-sm text-green-800 dark:text-green-300">
          <p className="font-semibold">Import complete</p>
          <ul className="mt-1 list-disc pl-5 space-y-0.5">
            <li>{result.created} player{result.created !== 1 ? "s" : ""} created</li>
            <li>{result.updated} player{result.updated !== 1 ? "s" : ""} updated</li>
            {result.addedToTeam > 0 && <li>{result.addedToTeam} added to the selected team</li>}
          </ul>
          {result.errors.length > 0 && (
            <div className="mt-2 text-amber-700 dark:text-amber-400">
              <p className="font-medium">{result.errors.length} issue{result.errors.length !== 1 ? "s" : ""}:</p>
              <ul className="list-disc pl-5">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <Link href="/players" className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            View players →
          </Link>
          <button
            onClick={() => { setResult(null); setPlan(null); setRaw(""); setFileName(null); }}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-5 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Import another
          </button>
        </div>
      </div>
    );
  }

  // ── Review screen ──
  if (plan) {
    const creates = plan.items.filter((i) => i.status === "create");
    const updates = plan.items.filter((i) => i.status === "update");
    const ambiguous = plan.items.filter((i) => i.status === "ambiguous");

    return (
      <div className="space-y-6">
        <button onClick={() => setPlan(null)} className="text-sm text-blue-600 hover:underline">
          ← Edit input
        </button>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <Stat n={plan.counts.create} label="New" />
          <Stat n={plan.counts.update} label="Changed" />
          <Stat n={plan.counts.unchanged} label="Up to date" />
          <Stat n={plan.counts.ambiguous} label="Need review" amber={plan.counts.ambiguous > 0} />
        </div>

        {plan.errors.length > 0 && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
            <ul className="list-disc pl-4 space-y-0.5">{plan.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
        )}

        {creates.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              New players ({creates.filter((i) => createOn[i.key]).length} of {creates.length})
            </h3>
            <ul className="rounded-lg border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
              {creates.map((item) => (
                <li key={item.key} className="flex items-start gap-3 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={createOn[item.key] ?? true}
                    onChange={(e) => setCreateOn((s) => ({ ...s, [item.key]: e.target.checked }))}
                    className="mt-1"
                  />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {item.incoming.first_name} {item.incoming.last_name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{summarize(item.incoming)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {updates.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Changes to existing players ({updates.length})
            </h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
              Conflicts (a value you already have, shown in amber) are off by default — check the ones you want to overwrite.
            </p>
            <ul className="space-y-3">
              {updates.map((item) => (
                <li key={item.key} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
                  <p className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    {item.incoming.first_name} {item.incoming.last_name}
                    {item.matchBy === "name" && (
                      <span className="text-[10px] font-normal rounded-full bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-gray-500 dark:text-gray-400">
                        matched by name
                      </span>
                    )}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {item.diffs.map((df) => (
                      <li key={df.key} className="flex items-start gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={diffOn[item.key]?.[df.key] ?? false}
                          onChange={(e) =>
                            setDiffOn((s) => ({ ...s, [item.key]: { ...s[item.key], [df.key]: e.target.checked } }))
                          }
                          className="mt-0.5"
                        />
                        <span className={df.conflict ? "text-amber-700 dark:text-amber-400" : "text-gray-600 dark:text-gray-300"}>
                          <span className="font-medium">{df.label}:</span>{" "}
                          <span className="line-through opacity-60">{df.from}</span> → <span className="font-medium">{df.to}</span>
                          {df.conflict && <span className="ml-1 text-[10px] uppercase tracking-wide">conflict</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        )}

        {ambiguous.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">
              Need review — skipped ({ambiguous.length})
            </h3>
            <ul className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 divide-y divide-amber-100 dark:divide-amber-900 text-xs">
              {ambiguous.map((item) => (
                <li key={item.key} className="px-3 py-2 text-amber-800 dark:text-amber-300">
                  <span className="font-medium">{item.incoming.first_name} {item.incoming.last_name}</span> matches{" "}
                  {item.candidates?.length} existing players — edit them manually to avoid a wrong merge.
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Team assignment */}
        <section className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label htmlFor="team" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Add these players to a team <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <select
            id="team"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="input bg-white dark:bg-gray-900 max-w-sm"
          >
            <option value="">— Don&rsquo;t add to a team —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}{t.season ? ` · ${t.season}` : ""}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Every player created or updated above will be added to this team&rsquo;s roster (existing roster spots are left alone).
          </p>
        </section>

        <div className="flex gap-3 sticky bottom-0 bg-gradient-to-t from-white dark:from-gray-950 pt-3">
          <button
            onClick={runApply}
            disabled={applying}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {applying ? "Applying…" : "Apply changes"}
          </button>
          <button
            onClick={() => setPlan(null)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-5 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Input screen ──
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
      <div className="flex items-center gap-3">
        <label className="inline-flex items-center rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
          Upload .json file
          <input type="file" accept=".json,application/json,.txt" onChange={onFile} className="hidden" />
        </label>
        {fileName && <span className="text-xs text-gray-500 dark:text-gray-400">{fileName}</span>}
        <span className="text-xs text-gray-400">or paste below</span>
      </div>

      <textarea
        value={raw}
        onChange={(e) => { setRaw(e.target.value); setFileName(null); }}
        rows={14}
        placeholder='[ { "memberPersonId": 3483979, "playerName": "Ally DiFabbio", "youthGender": "F", "jerseySize": "Youth Small", "parentName": "Jill DiFabbio", "parentPrimaryPhoneNumber": "702-690-0814", "parentEmail": "jilldifabbio@gmail.com" }, … ]'
        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-xs font-mono shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

      {analyzeErr && <p className="text-sm text-red-600">{analyzeErr}</p>}

      <button
        onClick={runAnalyze}
        disabled={analyzing || !raw.trim()}
        className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {analyzing ? "Analyzing…" : "Review changes"}
      </button>
    </div>
  );
}

function Stat({ n, label, amber }: { n: number; label: string; amber?: boolean }) {
  return (
    <div className={`rounded-lg border px-2 py-2 ${amber ? "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20" : "border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"}`}>
      <p className={`text-xl font-bold ${amber ? "text-amber-600 dark:text-amber-400" : "text-gray-900 dark:text-white"}`}>{n}</p>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
    </div>
  );
}

function summarize(inc: Incoming): string {
  const bits: string[] = [];
  if (inc.shirt_size) bits.push(inc.shirt_size);
  if (inc.gender) bits.push(inc.gender);
  if (inc.weight) bits.push(`${inc.weight} lb`);
  if (inc.parent) bits.push(`Parent: ${inc.parent.first_name} ${inc.parent.last_name}`.trim());
  return bits.join(" · ") || "—";
}
