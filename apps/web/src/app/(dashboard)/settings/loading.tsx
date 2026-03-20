function Sk({ className }: { className: string }) {
  return <div className={`skeleton ${className}`} />;
}

export default function SettingsLoading() {
  return (
    <div className="animate-fade-in" role="status" aria-label="Loading settings">
      <div className="mb-8">
        <Sk className="h-7 w-28" />
        <Sk className="h-4 w-48 mt-2" />
      </div>

      <div className="space-y-6 max-w-2xl">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`rounded-xl border border-surface-200 bg-surface-0 p-6 animate-slide-up stagger-${i}`}>
            <Sk className="h-5 w-32 mb-4" />
            <div className="space-y-4">
              <div>
                <Sk className="h-3 w-20 mb-2" />
                <Sk className="h-10 w-full rounded-xl" />
              </div>
              <div>
                <Sk className="h-3 w-24 mb-2" />
                <Sk className="h-10 w-full rounded-xl" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Loading settings...</span>
    </div>
  );
}
