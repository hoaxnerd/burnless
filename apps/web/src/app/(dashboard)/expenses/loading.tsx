function Sk({ className }: { className: string }) {
  return <div className={`skeleton ${className}`} />;
}

export default function ExpensesLoading() {
  return (
    <div className="animate-fade-in" role="status" aria-label="Loading expenses">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Sk className="h-7 w-32" />
          <Sk className="h-4 w-64 mt-2" />
        </div>
        <Sk className="h-10 w-36 rounded-xl" />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={`rounded-xl border border-surface-200 bg-surface-0 p-6 animate-slide-up stagger-${i}`}>
            <div className="flex items-center justify-between">
              <Sk className="h-4 w-20" />
              <Sk className="h-4 w-4 rounded" />
            </div>
            <Sk className="h-8 w-28 mt-2" />
            <Sk className="h-3 w-24 mt-2" />
          </div>
        ))}
      </div>

      {/* Insights skeleton */}
      <div className="space-y-3 mb-6">
        {[1, 2].map((i) => (
          <div key={i} className={`rounded-xl border border-surface-200 bg-surface-50/50 p-4 animate-slide-up stagger-${i + 4}`}>
            <div className="flex items-start gap-3">
              <Sk className="h-7 w-7 rounded-lg flex-shrink-0" />
              <div className="flex-1">
                <Sk className="h-4 w-48 mb-1.5" />
                <Sk className="h-3 w-full" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* View toggle */}
      <Sk className="h-9 w-44 rounded-lg mb-6" />

      {/* Charts section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 rounded-xl border border-surface-200 bg-surface-0 p-6">
          <Sk className="h-5 w-36 mb-1" />
          <Sk className="h-3 w-56 mb-4" />
          <Sk className="h-[280px] w-full rounded-lg" />
        </div>
        <div className="rounded-xl border border-surface-200 bg-surface-0 p-6">
          <Sk className="h-5 w-28 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Sk className="h-2.5 w-2.5 rounded-full" />
                    <Sk className="h-3 w-24" />
                  </div>
                  <Sk className="h-3 w-12" />
                </div>
                <Sk className="h-1.5 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl border border-surface-200 bg-surface-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-200 flex items-center gap-3">
          <Sk className="h-5 w-28" />
          <div className="ml-auto flex items-center gap-2">
            <Sk className="h-8 w-48 rounded-lg" />
            <Sk className="h-8 w-32 rounded-lg" />
          </div>
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-3.5 border-b border-surface-100">
            <Sk className="h-4 w-4 rounded" />
            <Sk className="h-4 w-36" />
            <Sk className="h-5 w-24 rounded-md" />
            <Sk className="h-4 w-16 ml-auto" />
            <Sk className="h-4 w-12" />
            <Sk className="h-5 w-10 rounded-full" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading expenses...</span>
    </div>
  );
}
