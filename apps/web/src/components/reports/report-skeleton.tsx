/** Lightweight skeleton placeholder for report content areas wrapped in Suspense. */
export function ReportContentSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label="Loading report">
      {/* Chart placeholders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6">
          <div className="h-4 w-40 bg-surface-100 rounded mb-4" />
          <div className="h-64 bg-surface-50 rounded-xl" />
        </div>
        <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6">
          <div className="h-4 w-32 bg-surface-100 rounded mb-4" />
          <div className="h-64 bg-surface-50 rounded-xl" />
        </div>
      </div>
      {/* Table placeholder */}
      <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6">
        <div className="h-4 w-48 bg-surface-100 rounded mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 bg-surface-50 rounded" />
          ))}
        </div>
      </div>
      <span className="sr-only">Loading report data...</span>
    </div>
  );
}
