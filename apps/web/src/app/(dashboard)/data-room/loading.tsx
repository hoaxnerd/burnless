function Sk({ className }: { className: string }) {
  return <div className={`skeleton ${className}`} />;
}

export default function DataRoomLoading() {
  return (
    <div className="animate-fade-in" role="status" aria-label="Loading data room">
      <div className="mb-8">
        <Sk className="h-7 w-32" />
        <Sk className="h-4 w-56 mt-2" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`rounded-xl bg-surface-0 border border-surface-200 p-6 animate-slide-up stagger-${Math.min(i + 1, 6)}`}>
            <Sk className="h-8 w-8 rounded-lg mb-3" />
            <Sk className="h-4 w-32 mb-2" />
            <Sk className="h-3 w-full mb-1" />
            <Sk className="h-3 w-3/4" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading data room...</span>
    </div>
  );
}
