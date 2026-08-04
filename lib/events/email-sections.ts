// Shared "Who's coming" and cost-breakdown sections, used by both the signup
// confirmation and the reminder email so a family sees the same layout in each.
import { esc, infoRow, sectionHeading, tbl } from "@/lib/email-template";
import type { SignupAttendee } from "@/lib/types";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const isAttending = (a: SignupAttendee) => (a.status ?? "attending") !== "declined";

type WhoGroup = { label: string; names: string[]; unnamed: number };
function groupWho(list: SignupAttendee[]): WhoGroup[] {
  const g: WhoGroup[] = [];
  for (const a of list) {
    let e = g.find((x) => x.label === a.tier_label);
    if (!e) {
      e = { label: a.tier_label, names: [], unnamed: 0 };
      g.push(e);
    }
    const nm = a.name?.trim();
    if (nm) e.names.push(nm);
    else e.unnamed++;
  }
  return g;
}
function whoValue(e: WhoGroup): string {
  let v = e.names.join(", ");
  if (e.unnamed > 0) v = v ? `${v} + ${e.unnamed} more` : `× ${e.unnamed}`;
  return v;
}

// Plain-text "Who's coming" lines for the text/fallback body.
export function groupWhoText(attendees: SignupAttendee[]): string[] {
  return groupWho(attendees.filter(isAttending)).map((e) => `${e.label}: ${whoValue(e)}`);
}

// "Who's coming" section (grouped by tier; per-attendee declines shown as
// "(not coming)"). Returns "" when there's nothing to show.
export function whosComingSection(attendees: SignupAttendee[]): string {
  const whoRows = groupWho(attendees.filter(isAttending))
    .map((e) => infoRow(e.label, whoValue(e)))
    .join("");
  const declinedRows = groupWho(attendees.filter((a) => a.status === "declined"))
    .map((e) => infoRow(`${e.label} (not coming)`, whoValue(e)))
    .join("");
  if (!whoRows && !declinedRows) return "";
  return sectionHeading("Who's coming") + tbl(whoRows + declinedRows);
}

// Attributes that are the same across every attendee in a group (so they can
// describe the whole line). Null/absent values are ignored.
function groupConstAttrs(items: SignupAttendee[]): Map<string, string | number | boolean> {
  const m = new Map<string, string | number | boolean>();
  if (!items.length) return m;
  const keys = new Set<string>();
  for (const a of items) for (const k of Object.keys(a.attributes ?? {})) keys.add(k);
  for (const k of keys) {
    const first = items[0].attributes?.[k];
    if (first == null) continue;
    if (items.every((a) => JSON.stringify(a.attributes?.[k] ?? null) === JSON.stringify(first))) m.set(k, first);
  }
  return m;
}

function fmtAttr(v: string | number | boolean): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return String(v);
}

function payRow(left: string, right: string, opts?: { strong?: boolean; top?: boolean }): string {
  const base = "padding:6px 0;font-size:14px;";
  const top = opts?.top ? "border-top:2px solid #e5e7eb;padding-top:10px;" : "";
  const strong = opts?.strong ? "font-weight:700;color:#111827;" : "color:#374151;";
  return `<tr>
    <td style="${base}${top}${strong}">${left}</td>
    <td style="${base}${top}${strong}text-align:right;white-space:nowrap;">${right}</td>
  </tr>`;
}

// Itemized cost breakdown → a labeled section reconciling to totalCents. One line
// per (tier, unit price); charged and free units split. Returns "" when free.
// Labels default to the owed wording; pass overrides for a paid breakdown.
export function costBreakdownSection(
  attendees: SignupAttendee[],
  totalCents: number,
  opts?: { heading?: string; totalLabel?: string }
): string {
  if (totalCents <= 0) return "";
  const heading = opts?.heading ?? "What you owe";
  const totalLabel = opts?.totalLabel ?? "Total due";
  const attending = attendees.filter(isAttending);

  // Group by (tier, unit price) — keeping the attendees so we can tell apart two
  // lines of the same tier that priced differently (e.g. a participating adult
  // vs a watcher) by the attribute that differs between them.
  type Group = { label: string; unit: number; items: SignupAttendee[] };
  const groups: Group[] = [];
  for (const a of attending) {
    const e = groups.find((x) => x.label === a.tier_label && x.unit === a.amount_cents);
    if (e) e.items.push(a);
    else groups.push({ label: a.tier_label, unit: a.amount_cents, items: [a] });
  }

  const labelCount = new Map<string, number>();
  for (const g of groups) labelCount.set(g.label, (labelCount.get(g.label) ?? 0) + 1);
  const constAttrs = new Map<Group, Map<string, string | number | boolean>>();
  for (const g of groups) constAttrs.set(g, groupConstAttrs(g.items));

  const rows = groups
    .map((g) => {
      const count = g.items.length;

      // When another group shares this tier label, qualify by the attribute(s)
      // whose (constant) value differs from those siblings.
      let qualifier = "";
      if ((labelCount.get(g.label) ?? 0) > 1) {
        const mine = constAttrs.get(g)!;
        const parts: string[] = [];
        for (const [k, v] of mine) {
          const distinguishes = groups.some((o) => {
            if (o === g || o.label !== g.label) return false;
            const om = constAttrs.get(o)!;
            return !om.has(k) || JSON.stringify(om.get(k)) !== JSON.stringify(v);
          });
          if (distinguishes) parts.push(`${k}: ${fmtAttr(v)}`);
        }
        qualifier = parts.join(", ");
      }

      const labelHtml = qualifier
        ? `${esc(g.label)} <span style="color:#6b7280;">(${esc(qualifier)})</span>`
        : esc(g.label);
      const left =
        g.unit > 0
          ? `${labelHtml} <span style="color:#9ca3af;">${count} × ${money(g.unit)}</span>`
          : `${labelHtml} <span style="color:#9ca3af;">× ${count}</span>`;
      const right = g.unit > 0 ? money(g.unit * count) : `<span style="color:#9ca3af;">No charge</span>`;
      return payRow(left, right);
    })
    .join("");
  const totalRow = payRow(totalLabel, money(totalCents), { strong: true, top: true });
  return (
    sectionHeading(heading) +
    `<table width="100%" cellpadding="0" cellspacing="0" style="margin:2px 0 8px;border-collapse:collapse;">${rows}${totalRow}</table>`
  );
}
