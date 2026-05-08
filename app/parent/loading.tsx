export default function ParentHomeLoading() {
  return (
    <div className="animate-pulse space-y-8">
      {[...Array(2)].map((_, k) => (
        <div key={k}>
          {/* Player name */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-16 bg-gray-200 dark:bg-gray-700 rounded-lg shrink-0" />
            <div className="space-y-2">
              <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
          </div>

          {/* Season rows */}
          {[...Array(2)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-3 border-b border-gray-100 dark:border-gray-800">
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-36 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
