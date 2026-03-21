function Sk({ className }: { className: string }) {
  return <div className={`skeleton ${className}`} />;
}

export default function ScenarioCompareLoading() {
  return (
    <div className="animate-fade-in" role="status" aria-label="Loading report">
      <div className="flex items-center gap-2 mb-2">
        <Sk className="h-3.5 w-14" />
        <Sk className="h-3.5 w-2" />
      </div>
      <div className="mb-6">
        <Sk className="h-7 w-52" />
        <Sk className="h-4 w-40 mt-2" />
      </div>
      <div className="flex gap-3 mb-6">
        <Sk className="h-10 w-48 rounded-lg" />
        <Sk className="h-10 w-48 rounded-lg" />
        <Sk className="h-10 w-28 rounded-lg" />
      </div>
      <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
        <Sk className="h-64 w-full rounded-lg" />
      </div>
      <span className="sr-only">Loading report...</span>
    </div>
  );
}
