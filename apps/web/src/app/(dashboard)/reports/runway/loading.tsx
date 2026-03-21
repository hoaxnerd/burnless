function Sk({ className }: { className: string }) {
  return <div className={`skeleton ${className}`} />;
}

export default function RunwayLoading() {
  return (
    <div className="animate-fade-in" role="status" aria-label="Loading report">
      <div className="flex items-center gap-2 mb-2">
        <Sk className="h-3.5 w-14" />
        <Sk className="h-3.5 w-2" />
      </div>
      <div className="mb-6">
        <Sk className="h-7 w-44" />
        <Sk className="h-4 w-56 mt-2" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-surface-0 border border-surface-200 p-5">
            <Sk className="h-3 w-20 mb-2" />
            <Sk className="h-7 w-24" />
          </div>
        ))}
      </div>
      <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
        <Sk className="h-48 w-full rounded-lg" />
      </div>
      <span className="sr-only">Loading report...</span>
    </div>
  );
}
