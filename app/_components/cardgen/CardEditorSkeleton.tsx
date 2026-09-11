// Route-transition skeleton for the Card Creator pages. Shown instantly (via
// each route's loading.tsx) while the server fetches player/roster/card data, so
// navigating to the editor doesn't sit on a blank screen for a few seconds.
export default function CardEditorSkeleton() {
  return (
    <div className="max-w-2xl lg:max-w-none animate-pulse">
      {/* Back link */}
      <div className="h-3 w-16 rounded bg-gray-200 dark:bg-gray-700" />

      {/* Header */}
      <div className="mt-3 mb-5 space-y-2">
        <div className="h-7 w-64 max-w-full rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-40 rounded bg-gray-100 dark:bg-gray-800" />
      </div>

      {/* Editor: preview column + controls column (matches the edit layout) */}
      <div className="lg:grid lg:justify-center lg:gap-8 lg:items-start lg:[grid-template-columns:clamp(22rem,30vw,30rem)_minmax(0,46rem)]">
        {/* Preview */}
        <div className="mx-auto w-full max-w-sm lg:mx-0">
          {/* Front / back toggle */}
          <div className="mb-3 h-9 w-full rounded-lg bg-gray-100 dark:bg-gray-800" />
          {/* Card */}
          <div className="aspect-[5/7] w-full rounded-2xl bg-gray-200 dark:bg-gray-700" />
        </div>

        {/* Controls */}
        <div className="mt-6 space-y-3 lg:mt-0">
          <div className="h-16 w-full rounded-xl bg-gray-100 dark:bg-gray-800" />
          <div className="h-9 w-40 rounded bg-gray-100 dark:bg-gray-800" />
          <div className="h-10 w-full rounded-lg bg-gray-100 dark:bg-gray-800" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-8 w-full rounded bg-gray-100 dark:bg-gray-800" />
          ))}
          <div className="mt-4 flex gap-2">
            <div className="h-10 flex-1 rounded-lg bg-gray-200 dark:bg-gray-700" />
            <div className="h-10 flex-1 rounded-lg bg-gray-200 dark:bg-gray-700" />
          </div>
        </div>
      </div>
    </div>
  );
}
