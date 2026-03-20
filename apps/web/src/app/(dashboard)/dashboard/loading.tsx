/**
 * Dashboard skeleton — shown while page.tsx server component loads.
 * Uses CSS shimmer animation, zero JS. Matches the rebuilt dashboard layout.
 */

function Sk({ className }: { className: string }) {
  return <div className={`skeleton ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="animate-fade-in" role="status" aria-label="Loading dashboard">
      {/* AI Insight Banner skeleton */}
      <div className="rounded-2xl border border-surface-200 bg-surface-0 p-5 mb-6">
        <div className="flex items-start gap-4">
          <Sk className="h-9 w-9 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Sk className="h-3 w-16" />
            <Sk className="h-4 w-64 max-w-full" />
            <Sk className="h-3 w-48 max-w-full" />
          </div>
          <Sk className="h-7 w-20 rounded-lg flex-shrink-0" />
        </div>
      </div>

      {/* Header skeleton */}
      <div className="mb-8">
        <Sk className="h-7 w-48" />
        <Sk className="h-4 w-64 mt-2" />
      </div>

      {/* KPI Cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`rounded-2xl border border-surface-200 bg-surface-0 p-5 sm:p-6 animate-slide-up stagger-${i}`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sk className="h-4 w-4 rounded" />
                <Sk className="h-3 w-20" />
              </div>
              <Sk className="h-8 w-20 rounded" />
            </div>
            <Sk className="h-8 w-28 mb-2" />
            <Sk className="h-3 w-20" />
          </div>
        ))}
      </div>

      {/* Quick Actions skeleton */}
      <div className="flex flex-wrap gap-3 mb-8 animate-slide-up stagger-5">
        {[1, 2, 3, 4].map((i) => (
          <Sk key={i} className="h-10 w-32 rounded-xl" />
        ))}
      </div>

      {/* Charts skeleton */}
      <div className="space-y-6 animate-slide-up stagger-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-surface-200 bg-surface-0 p-6">
              <div className="mb-4">
                <Sk className="h-4 w-32 mb-1" />
                <Sk className="h-3 w-48" />
              </div>
              <Sk className="h-60 w-full rounded-lg" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-surface-200 bg-surface-0 p-6">
              <div className="mb-4">
                <Sk className="h-4 w-32 mb-1" />
                <Sk className="h-3 w-48" />
              </div>
              <Sk className="h-60 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only">Loading dashboard...</span>
    </div>
  );
}
