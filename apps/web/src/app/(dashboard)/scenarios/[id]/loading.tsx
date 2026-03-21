function Sk({ className }: { className: string }) {
  return <div className={`skeleton ${className}`} />;
}

export default function ScenarioDetailLoading() {
  return (
    <div className="animate-fade-in space-y-6" role="status" aria-label="Loading scenario">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Sk className="h-8 w-8 rounded-lg" />
          <div>
            <Sk className="h-7 w-48" />
            <Sk className="h-4 w-72 mt-2" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Sk className="h-9 w-20 rounded-xl" />
          <Sk className="h-9 w-20 rounded-xl" />
          <Sk className="h-9 w-28 rounded-xl" />
          <Sk className="h-10 w-32 rounded-xl" />
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={`rounded-xl border border-surface-200 bg-surface-0 p-4 flex items-center gap-3 animate-slide-up stagger-${i}`}>
            <Sk className="h-9 w-9 rounded-lg" />
            <div>
              <Sk className="h-3 w-20 mb-1.5" />
              <Sk className="h-5 w-16" />
            </div>
          </div>
        ))}
      </div>

      {/* What-If Builder */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sliders Panel */}
        <div className="lg:col-span-1 rounded-2xl bg-surface-0 border border-surface-200 p-6 space-y-6">
          <Sk className="h-4 w-36 mb-2" />
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between">
                <Sk className="h-3 w-24" />
                <Sk className="h-3 w-16" />
              </div>
              <Sk className="h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>

        {/* Projections */}
        <div className="lg:col-span-2 space-y-6">
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={`rounded-xl border border-surface-200 border-l-4 border-l-surface-300 p-4 animate-slide-up stagger-${i}`}>
                <Sk className="h-3 w-16 mb-2" />
                <Sk className="h-6 w-24" />
              </div>
            ))}
          </div>

          {/* Chart placeholders */}
          <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6">
            <Sk className="h-4 w-28 mb-1" />
            <Sk className="h-3 w-40 mb-4" />
            <Sk className="h-48 w-full rounded-xl" />
          </div>

          <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6">
            <Sk className="h-4 w-32 mb-1" />
            <Sk className="h-3 w-36 mb-4" />
            <Sk className="h-40 w-full rounded-xl" />
          </div>
        </div>
      </div>

      <span className="sr-only">Loading scenario...</span>
    </div>
  );
}
