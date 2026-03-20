function Sk({ className }: { className: string }) {
  return <div className={`skeleton ${className}`} />;
}

export default function ScenariosLoading() {
  return (
    <div className="animate-fade-in" role="status" aria-label="Loading scenarios">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Sk className="h-7 w-32" />
          <Sk className="h-4 w-60 mt-2" />
        </div>
        <Sk className="h-10 w-36 rounded-xl" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`rounded-xl border border-surface-200 bg-surface-0 p-6 animate-slide-up stagger-${i}`}>
            <Sk className="h-4 w-28 mb-2" />
            <div className="flex items-center gap-2 mb-3">
              <Sk className="h-5 w-16 rounded-full" />
              <Sk className="h-5 w-14 rounded-full" />
            </div>
            <Sk className="h-3 w-full mb-1" />
            <Sk className="h-3 w-3/4 mb-4" />
            <Sk className="h-3 w-24 mb-4" />
            <div className="flex items-center gap-2">
              <Sk className="h-8 w-28 rounded-lg" />
              <Sk className="h-8 w-24 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Loading scenarios...</span>
    </div>
  );
}
