// Registry of grantable tools. Single source of truth for the permission
// manager (/access) and every nav that surfaces tools (owner Tools dropdown,
// scoped helper nav, Parent Portal nav). Keys match the `tools[]` values stored
// in the tool_access table.

export type ToolKey = "roster-creator" | "card-creator";

export type ToolDef = {
  key: ToolKey;
  label: string;
  // Where this tool lives for the owner / scoped helpers (the (protected) area).
  href: string;
  // Where this tool lives inside the Parent Portal, if a parent can be granted
  // it; null means it isn't offered to parents.
  parentHref: string | null;
};

export const TOOLS: readonly ToolDef[] = [
  {
    key: "roster-creator",
    label: "Roster Creator",
    href: "/tools/roster-creator",
    parentHref: null,
  },
  {
    key: "card-creator",
    label: "Card Creator",
    href: "/tools/card-creator",
    parentHref: "/parent/card-creator",
  },
] as const;

export function toolByKey(key: string): ToolDef | undefined {
  return TOOLS.find((t) => t.key === key);
}
