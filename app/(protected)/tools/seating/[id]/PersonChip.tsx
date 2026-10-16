"use client";

import type { DerivedStatus, PersonVM } from "../types";

// Status dot colors (match the PeoplePanel filter pills).
const DOT: Record<DerivedStatus, string> = {
  planning: "bg-gray-400",
  invited: "bg-blue-500",
  opened: "bg-amber-500",
  yes: "bg-green-500",
  no: "bg-red-500",
};

export function isKid(p: Pick<PersonVM, "kind">): boolean {
  return p.kind === "player" || p.kind === "sibling";
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Kid chips blue-tinted, adult (parent) violet-tinted, guest gray.
function tint(p: PersonVM): { circle: string; pill: string } {
  if (isKid(p))
    return {
      circle: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
      pill: "border-blue-200 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/30",
    };
  if (p.kind === "parent")
    return {
      circle: "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300",
      pill: "border-violet-200 dark:border-violet-900/60 bg-violet-50/60 dark:bg-violet-950/30",
    };
  return {
    circle: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
    pill: "border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40",
  };
}

// Draggable person pill: an initials circle + name + status dot. "row" is the
// full sidebar row; "mini" is the small pill used inside the SRO zone and as
// the drag ghost. All chips are pointer-drag sources (handled by SeatMap).
export default function PersonChip({
  person,
  variant,
  selected = false,
  onPointerDown,
}: {
  person: PersonVM;
  variant: "row" | "mini";
  selected?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  const t = tint(person);
  const ring = selected ? "ring-2 ring-blue-500" : "";

  if (variant === "mini") {
    return (
      <span
        onPointerDown={onPointerDown}
        title={person.displayName}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium text-gray-800 dark:text-gray-200 touch-none select-none cursor-grab active:cursor-grabbing ${t.pill} ${ring}`}
      >
        <span
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold ${t.circle}`}
        >
          {initialsOf(person.displayName)}
        </span>
        <span className="max-w-[90px] truncate">{person.displayName}</span>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[person.status]}`} />
        {person.locked && <span className="text-[9px]">🔒</span>}
      </span>
    );
  }

  return (
    <span
      onPointerDown={onPointerDown}
      title={person.displayName}
      className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2 py-1.5 touch-none select-none cursor-grab active:cursor-grabbing ${t.pill} ${ring}`}
    >
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${t.circle}`}
      >
        {initialsOf(person.displayName)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-white">
        {person.displayName}
        {person.locked && <span className="ml-1 text-[11px]">🔒</span>}
      </span>
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${DOT[person.status]}`}
        title={person.status}
      />
    </span>
  );
}
