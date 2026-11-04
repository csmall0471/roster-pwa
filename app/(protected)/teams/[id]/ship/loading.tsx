export default function ShipCardsLoading() {
  return (
    <div className="max-w-4xl animate-pulse">
      <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
      <div className="mt-2 h-7 w-56 bg-gray-200 dark:bg-gray-700 rounded" />
      <div className="mt-1.5 h-3 w-40 bg-gray-100 dark:bg-gray-800 rounded" />
      <div className="mt-6 h-16 bg-gray-100 dark:bg-gray-800 rounded-xl" />
      <div className="mt-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="h-5 w-5 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="h-3 w-64 bg-gray-100 dark:bg-gray-800 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
