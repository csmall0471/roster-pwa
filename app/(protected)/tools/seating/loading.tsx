export default function SeatingLoading() {
  return (
    <div className="max-w-4xl mx-auto animate-pulse">
      <div className="h-4 w-28 bg-gray-200 dark:bg-gray-700 rounded" />

      {/* Header */}
      <div className="mt-3 mb-6 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-36 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <div className="h-3 w-72 bg-gray-100 dark:bg-gray-800 rounded" />
        </div>
        <div className="h-9 w-28 bg-gray-200 dark:bg-gray-700 rounded-lg" />
      </div>

      {/* Plan rows */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="px-4 py-3 space-y-1.5">
            <div className="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-3 w-64 bg-gray-100 dark:bg-gray-800 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
