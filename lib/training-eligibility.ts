// Rule types — stored as JSONB in training_sessions.eligibility_rules.
// null means no restrictions (open to all players).

export type AgeRule  = { type: "age";  min?: number; max?: number }
export type TeamRule = { type: "team"; team_id: string; team_name: string }
export type LeafRule = AgeRule | TeamRule

export type RuleGroup = {
  type:       "group"
  op:         "AND" | "OR"
  conditions: Array<LeafRule | RuleGroup>
}

export type EligibilityRules = RuleGroup | null

function calcAge(dob: string, sessionDate: string): number {
  const b = new Date(dob + "T00:00:00")
  const s = new Date(sessionDate + "T00:00:00")
  let age = s.getFullYear() - b.getFullYear()
  const m = s.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && s.getDate() < b.getDate())) age--
  return age
}

function evalNode(
  node: LeafRule | RuleGroup,
  dob: string | null,
  teamIds: Set<string>,
  sessionDate: string,
): boolean {
  if (node.type === "group") {
    if (node.conditions.length === 0) return true
    return node.op === "AND"
      ? node.conditions.every((c) => evalNode(c, dob, teamIds, sessionDate))
      : node.conditions.some((c)  => evalNode(c, dob, teamIds, sessionDate))
  }
  if (node.type === "age") {
    if (!dob) return false
    const age = calcAge(dob, sessionDate)
    if (node.min !== undefined && age < node.min) return false
    if (node.max !== undefined && age > node.max) return false
    return true
  }
  if (node.type === "team") {
    return teamIds.has(node.team_id)
  }
  return true
}

export function isPlayerEligible(
  rules: EligibilityRules,
  dob: string | null,
  teamIds: Set<string>,
  sessionDate: string,
): boolean {
  if (!rules) return true
  return evalNode(rules, dob, teamIds, sessionDate)
}

export function describeRules(rules: EligibilityRules): string {
  if (!rules) return "Open to all"
  return describeNode(rules)
}

function describeNode(node: LeafRule | RuleGroup): string {
  if (node.type === "group") {
    if (node.conditions.length === 0) return "Open to all"
    const parts = node.conditions.map(describeNode)
    const sep = node.op === "AND" ? " and " : " or "
    return parts.length === 1 ? parts[0] : `(${parts.join(sep)})`
  }
  if (node.type === "age") {
    if (node.min !== undefined && node.max !== undefined) return `Ages ${node.min}–${node.max}`
    if (node.min !== undefined) return `Age ${node.min}+`
    if (node.max !== undefined) return `Age ${node.max} and under`
    return "Any age"
  }
  if (node.type === "team") return `On ${node.team_name}`
  return ""
}
