export default function CardsLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 space-y-1">
        <div className="h-8 w-40 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-3 w-24 bg-gray-100 dark:bg-gray-800 rounded" />
      </div>
      <div className="flex gap-2 mb-4">
        <div className="h-8 w-40 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        <div className="h-8 w-28 bg-gray-100 dark:bg-gray-800 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="rounded-xl bg-gray-200 dark:bg-gray-700 aspect-[5/7]" />
        ))}
      </div>
    </div>
  );
}
