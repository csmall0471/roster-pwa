// Invited → Opened → Accepted funnel for an event. Opens/accepts are matched
// to invitees by parent_id. Rendered server-side (no interactivity).

type Invite = { parent_id: string | null; name: string | null; sent_at: string };

export default function InvitesPanel({
  invites,
  openedParentIds,
  acceptedParentIds,
}: {
  invites: Invite[];
  openedParentIds: string[];
  acceptedParentIds: string[];
}) {
  if (invites.length === 0) return null;

  const opened = new Set(openedParentIds);
  const accepted = new Set(acceptedParentIds);

  const openedCount = invites.filter((i) => i.parent_id && opened.has(i.parent_id)).length;
  const acceptedCount = invites.filter((i) => i.parent_id && accepted.has(i.parent_id)).length;

  const status = (i: Invite): { label: string; cls: string } => {
    if (i.parent_id && accepted.has(i.parent_id))
      return { label: "Accepted", cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" };
    if (i.parent_id && opened.has(i.parent_id))
      return { label: "Opened", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" };
    return { label: "Invited", cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" };
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-gray-800 border-b border-gray-100 dark:border-gray-800">
        <Stat label="Invited" value={invites.length} />
        <Stat label="Opened" value={openedCount} />
        <Stat label="Accepted" value={acceptedCount} />
      </div>
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {invites.map((i, idx) => {
          const s = status(i);
          return (
            <li key={idx} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="text-gray-700 dark:text-gray-300">{i.name ?? "—"}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-3 text-center">
      <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}
