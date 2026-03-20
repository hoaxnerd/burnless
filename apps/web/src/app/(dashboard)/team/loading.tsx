function Sk({ className }: { className: string }) {
  return <div className={`skeleton ${className}`} />;
}

export default function TeamLoading() {
  return (
    <div className="animate-fade-in" role="status" aria-label="Loading team">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Sk className="h-7 w-20" />
          <Sk className="h-4 w-48 mt-2" />
        </div>
        <Sk className="h-10 w-36 rounded-xl" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`rounded-xl border border-surface-200 bg-surface-0 p-5 animate-slide-up stagger-${i}`}>
            <Sk className="h-3 w-20 mb-2" />
            <Sk className="h-7 w-20 mb-1" />
            <Sk className="h-3 w-16" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-surface-200 bg-surface-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-200">
          <Sk className="h-4 w-28" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-3 border-b border-surface-100">
            <Sk className="h-8 w-8 rounded-full" />
            <Sk className="h-4 w-32" />
            <Sk className="h-4 w-24" />
            <Sk className="h-4 w-20 ml-auto" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading team...</span>
    </div>
  );
}
