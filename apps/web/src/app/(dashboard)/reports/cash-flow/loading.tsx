function Sk({ className }: { className: string }) {
  return <div className={`skeleton ${className}`} />;
}

export default function CashFlowLoading() {
  return (
    <div className="animate-fade-in" role="status" aria-label="Loading report">
      <div className="flex items-center gap-2 mb-2">
        <Sk className="h-3.5 w-14" />
        <Sk className="h-3.5 w-2" />
      </div>
      <div className="mb-6">
        <Sk className="h-7 w-52" />
        <Sk className="h-4 w-56 mt-2" />
      </div>
      <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
        <div className="space-y-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <Sk className="h-4 w-32" />
              <div className="flex gap-4">
                <Sk className="h-4 w-20" />
                <Sk className="h-4 w-20" />
                <Sk className="h-4 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Loading report...</span>
    </div>
  );
}
