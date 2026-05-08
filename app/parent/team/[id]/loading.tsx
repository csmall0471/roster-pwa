export default function TeamRosterLoading() {
  return (
    <div className="animate-pulse">
      {/* Back link */}
      <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-4" />

      {/* Team name */}
      <div className="h-7 w-52 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
      <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-1" />
      <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-8" />

      {/* Roster heading */}
      <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-3" />

      {/* Player card grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {[...Array(12)].map((_, i) => (
          <div key={i} className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
            <div className="aspect-[5/7] bg-gray-200 dark:bg-gray-700" />
            <div className="px-2 py-1.5">
              <div className="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
