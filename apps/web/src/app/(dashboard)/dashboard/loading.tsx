export default function DashboardLoading() {
  return (
    <div className="animate-pulse" role="status" aria-label="Loading dashboard">
      <div className="mb-8">
        <div className="h-8 w-48 bg-surface-200 rounded-lg" />
        <div className="h-4 w-72 bg-surface-100 rounded mt-2" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-surface-0 border border-surface-200 p-5">
            <div className="h-3 w-20 bg-surface-100 rounded mb-3" />
            <div className="h-7 w-24 bg-surface-200 rounded" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-surface-0 border border-surface-200 p-6">
            <div className="h-5 w-40 bg-surface-200 rounded mb-4" />
            <div className="h-48 bg-surface-100 rounded" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading dashboard...</span>
    </div>
  );
}
