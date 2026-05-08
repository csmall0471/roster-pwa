export default function PlayerLoading() {
  return (
    <div className="animate-pulse">
      {/* Back link */}
      <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-6" />

      {/* Player card header */}
      <div className="flex gap-4 mb-8">
        <div className="w-24 h-32 bg-gray-200 dark:bg-gray-700 rounded-xl shrink-0" />
        <div className="flex-1 flex flex-col justify-center gap-2">
          <div className="h-6 w-40 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>

      {/* Section heading */}
      <div className="h-3 w-28 bg-gray-200 dark:bg-gray-700 rounded mb-3" />

      {/* Season rows */}
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-36 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
          <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      ))}

      {/* Photo card heading */}
      <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded mt-8 mb-3" />

      {/* Photo card grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="aspect-[5/7] bg-gray-200 dark:bg-gray-700 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
