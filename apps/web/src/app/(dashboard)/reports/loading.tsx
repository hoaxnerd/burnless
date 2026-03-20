export default function ReportsLoading() {
  return (
    <div className="animate-pulse" role="status" aria-label="Loading reports">
      <div className="mb-8">
        <div className="h-8 w-32 bg-surface-200 rounded-lg" />
        <div className="h-4 w-64 bg-surface-100 rounded mt-2" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-surface-0 border border-surface-200 p-6">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 bg-surface-100 rounded" />
              <div className="flex-1">
                <div className="h-4 w-28 bg-surface-200 rounded mb-2" />
                <div className="h-3 w-44 bg-surface-100 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Loading reports...</span>
    </div>
  );
}
