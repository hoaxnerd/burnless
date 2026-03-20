function Sk({ className }: { className: string }) {
  return <div className={`skeleton ${className}`} />;
}

export default function RevenueLoading() {
  return (
    <div className="animate-fade-in" role="status" aria-label="Loading revenue">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Sk className="h-7 w-32" />
          <Sk className="h-4 w-56 mt-2" />
        </div>
        <Sk className="h-10 w-44 rounded-xl" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`rounded-xl border border-surface-200 bg-surface-0 p-5 animate-slide-up stagger-${i}`}>
            <Sk className="h-3 w-16 mb-2" />
            <Sk className="h-7 w-28 mb-1" />
            <Sk className="h-3 w-20" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-surface-200 bg-surface-0 p-6 mb-6">
        <Sk className="h-4 w-32 mb-1" />
        <Sk className="h-3 w-48 mb-6" />
        <Sk className="h-48 w-full rounded-lg" />
      </div>

      <div className="rounded-xl border border-surface-200 bg-surface-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-200">
          <Sk className="h-4 w-28" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-3 border-b border-surface-100">
            <Sk className="h-4 w-36" />
            <Sk className="h-4 w-20" />
            <Sk className="h-4 w-24 ml-auto" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading revenue...</span>
    </div>
  );
}
