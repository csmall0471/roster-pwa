// Map-shaped pulse skeleton while the plan loads: toolbar bar, a sidebar of
// chip rows, and a large rounded canvas block.
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-4">
        <div className="h-4 w-16 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="mt-3 h-7 w-56 rounded bg-gray-200 dark:bg-gray-800" />
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(260px,320px)_1fr] lg:gap-4">
        {/* Sidebar: chip rows */}
        <div className="hidden lg:block">
          <div className="w-72 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
            <div className="h-9 rounded-lg bg-gray-100 dark:bg-gray-800" />
            <div className="mt-3 flex gap-1.5">
              <div className="h-6 w-12 rounded-full bg-gray-100 dark:bg-gray-800" />
              <div className="h-6 w-16 rounded-full bg-gray-100 dark:bg-gray-800" />
              <div className="h-6 w-14 rounded-full bg-gray-100 dark:bg-gray-800" />
            </div>
            <div className="mt-4 space-y-2">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-gray-200 dark:bg-gray-700" />
                  <div className="h-4 flex-1 rounded bg-gray-100 dark:bg-gray-800" />
                  <div className="h-4 w-10 rounded-full bg-gray-100 dark:bg-gray-800" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Toolbar + canvas */}
        <div className="mt-4 lg:mt-0 min-w-0">
          <div className="flex items-center gap-2">
            <div className="h-9 w-40 rounded-lg bg-gray-200 dark:bg-gray-800" />
            <div className="h-9 w-24 rounded-lg bg-gray-100 dark:bg-gray-800" />
            <div className="h-9 w-28 rounded-lg bg-gray-100 dark:bg-gray-800" />
            <div className="ml-auto h-9 w-32 rounded-lg bg-gray-100 dark:bg-gray-800" />
          </div>
          <div
            className="mt-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-800/60"
            style={{ height: "calc(100dvh - 240px)", minHeight: 420 }}
          />
        </div>
      </div>
    </div>
  );
}
