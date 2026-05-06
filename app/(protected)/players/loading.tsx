export default function PlayersLoading() {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-28 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        <div className="flex gap-2">
          <div className="h-9 w-28 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <div className="h-9 w-24 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <div className="h-9 w-28 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        </div>
      </div>

      {/* Filter/sort bar */}
      <div className="flex gap-2 mb-4">
        <div className="h-9 w-36 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        <div className="h-9 w-32 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        <div className="h-9 w-28 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        <div className="h-9 w-28 bg-gray-200 dark:bg-gray-700 rounded-lg" />
      </div>

      {/* Player rows */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="w-5 h-5 bg-gray-200 dark:bg-gray-700 rounded shrink-0" />
            <div className="w-11 h-14 bg-gray-200 dark:bg-gray-700 rounded-lg shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="h-3 w-56 bg-gray-100 dark:bg-gray-800 rounded" />
            </div>
            <div className="h-3 w-12 bg-gray-100 dark:bg-gray-800 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
