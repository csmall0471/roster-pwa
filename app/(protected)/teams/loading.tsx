export default function TeamsLoading() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        <div className="h-9 w-28 bg-gray-200 dark:bg-gray-700 rounded-lg" />
      </div>

      {[...Array(3)].map((_, i) => (
        <div key={i} className="mb-6">
          <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
          <ul className="space-y-3">
            {[...Array(i === 2 ? 2 : 3)].map((_, j) => (
              <li
                key={j}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 px-5 py-4 flex items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-3 w-56 bg-gray-100 dark:bg-gray-800 rounded" />
                  <div className="h-3 w-32 bg-gray-100 dark:bg-gray-800 rounded" />
                </div>
                <div className="flex gap-3 shrink-0">
                  <div className="h-4 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-4 w-8 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-4 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
