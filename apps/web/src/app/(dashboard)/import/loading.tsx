function Sk({ className }: { className: string }) {
  return <div className={`skeleton ${className}`} />;
}

export default function ImportLoading() {
  return (
    <div className="animate-fade-in" role="status" aria-label="Loading import">
      <div className="mb-8">
        <Sk className="h-7 w-24" />
        <Sk className="h-4 w-52 mt-2" />
      </div>
      <div className="rounded-xl border border-dashed border-surface-300 bg-surface-0 p-12 text-center animate-slide-up">
        <Sk className="h-12 w-12 rounded-xl mx-auto mb-4" />
        <Sk className="h-5 w-48 mx-auto mb-2" />
        <Sk className="h-3 w-64 mx-auto" />
      </div>
      <span className="sr-only">Loading import...</span>
    </div>
  );
}
