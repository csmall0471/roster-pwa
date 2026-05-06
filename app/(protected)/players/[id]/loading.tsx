export default function PlayerDetailLoading() {
  return (
    <div className="max-w-2xl animate-pulse">
      {/* Back link */}
      <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded" />

      {/* Header */}
      <div className="flex items-start gap-5 mt-4 mb-6">
        <div className="w-24 h-32 bg-gray-200 dark:bg-gray-700 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-7 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-3 w-56 bg-gray-100 dark:bg-gray-800 rounded" />
          <div className="flex gap-2 mt-3">
            <div className="h-7 w-20 bg-gray-200 dark:bg-gray-700 rounded-lg" />
            <div className="h-7 w-16 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Parents */}
      <div className="mb-6">
        <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="px-4 py-3 flex gap-4">
              <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="h-4 w-28 bg-gray-100 dark:bg-gray-800 rounded" />
              <div className="h-4 w-44 bg-gray-100 dark:bg-gray-800 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Season history */}
      <div className="mb-6">
        <div className="h-3 w-28 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="h-4 w-36 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-3 w-48 bg-gray-100 dark:bg-gray-800 rounded" />
              </div>
              <div className="h-5 w-14 bg-gray-100 dark:bg-gray-800 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Photo grid */}
      <div>
        <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl bg-gray-200 dark:bg-gray-700 aspect-[5/7]" />
          ))}
        </div>
      </div>
    </div>
  );
}
