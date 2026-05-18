"use client"

import type { EligibilityRules, RuleGroup, LeafRule } from "@/lib/training-eligibility"

export type TeamOption = { id: string; name: string }

type Props = {
  value:    EligibilityRules
  onChange: (v: EligibilityRules) => void
  teams:    TeamOption[]
}

function emptyGroup(op: "AND" | "OR"): RuleGroup {
  return { type: "group", op, conditions: [] }
}

export default function RuleBuilder({ value, onChange, teams }: Props) {
  if (!value) {
    return (
      <div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">
          No restrictions — open to all players
        </p>
        <button
          type="button"
          onClick={() => onChange(emptyGroup("AND"))}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          + Add eligibility rules
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Eligibility rules</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-red-500 hover:underline"
        >
          Remove all
        </button>
      </div>
      <GroupEditor group={value} onChange={onChange} teams={teams} depth={0} />
    </div>
  )
}

// ── GroupEditor ───────────────────────────────────────────────────────────────

function GroupEditor({
  group, onChange, teams, depth,
}: {
  group:    RuleGroup
  onChange: (g: RuleGroup) => void
  teams:    TeamOption[]
  depth:    number
}) {
  function update(i: number, updated: LeafRule | RuleGroup) {
    const conditions = [...group.conditions]
    conditions[i] = updated
    onChange({ ...group, conditions })
  }

  function remove(i: number) {
    onChange({ ...group, conditions: group.conditions.filter((_, idx) => idx !== i) })
  }

  function addLeaf(kind: "age" | "team") {
    const leaf: LeafRule = kind === "age"
      ? { type: "age" }
      : { type: "team", team_id: teams[0]?.id ?? "", team_name: teams[0]?.name ?? "" }
    onChange({ ...group, conditions: [...group.conditions, leaf] })
  }

  function addSubGroup() {
    onChange({ ...group, conditions: [...group.conditions, emptyGroup("OR")] })
  }

  const isNested = depth > 0

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${
      isNested
        ? "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40"
        : "border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/20"
    }`}>
      {/* AND / OR toggle */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 dark:text-gray-400">Match</span>
        {(["AND", "OR"] as const).map((op) => (
          <button
            key={op}
            type="button"
            onClick={() => onChange({ ...group, op })}
            className={`px-2 py-0.5 text-xs rounded font-semibold transition-colors ${
              group.op === op
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            {op === "AND" ? "ALL" : "ANY"}
          </button>
        ))}
        <span className="text-xs text-gray-500 dark:text-gray-400">of these:</span>
      </div>

      {/* Conditions */}
      {group.conditions.map((cond, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            {cond.type === "group" ? (
              <GroupEditor
                group={cond}
                onChange={(updated) => update(i, updated)}
                teams={teams}
                depth={depth + 1}
              />
            ) : (
              <LeafEditor
                rule={cond}
                onChange={(updated) => update(i, updated)}
                teams={teams}
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => remove(i)}
            className="shrink-0 text-red-400 hover:text-red-600 text-base leading-none mt-1.5"
            aria-label="Remove"
          >
            ×
          </button>
        </div>
      ))}

      {/* Add controls */}
      <div className="flex flex-wrap gap-3 pt-0.5">
        <button type="button" onClick={() => addLeaf("age")}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
          + Age rule
        </button>
        <button type="button" onClick={() => addLeaf("team")}
          disabled={teams.length === 0}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40 disabled:cursor-not-allowed">
          + Team rule
        </button>
        {depth === 0 && (
          <button type="button" onClick={addSubGroup}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
            + Group
          </button>
        )}
      </div>
    </div>
  )
}

// ── LeafEditor ────────────────────────────────────────────────────────────────

function LeafEditor({
  rule, onChange, teams,
}: {
  rule:     LeafRule
  onChange: (r: LeafRule) => void
  teams:    TeamOption[]
}) {
  const inputCls = "rounded border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"

  if (rule.type === "age") {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">Age</span>
        <input
          type="number" placeholder="min" min={0} max={99}
          value={rule.min ?? ""}
          onChange={(e) => onChange({ ...rule, min: e.target.value ? Number(e.target.value) : undefined })}
          className={`${inputCls} w-16`}
        />
        <span className="text-xs text-gray-400">–</span>
        <input
          type="number" placeholder="max" min={0} max={99}
          value={rule.max ?? ""}
          onChange={(e) => onChange({ ...rule, max: e.target.value ? Number(e.target.value) : undefined })}
          className={`${inputCls} w-16`}
        />
        <span className="text-xs text-gray-400 dark:text-gray-500">(at session date)</span>
      </div>
    )
  }

  if (rule.type === "team") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">On team</span>
        <select
          value={rule.team_id}
          onChange={(e) => {
            const t = teams.find((t) => t.id === e.target.value)
            if (t) onChange({ type: "team", team_id: t.id, team_name: t.name })
          }}
          className={`${inputCls} flex-1`}
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
    )
  }

  return null
}
