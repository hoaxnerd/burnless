interface SkeletonProps {
  className?: string;
}

/** Inline skeleton shimmer element. Apply dimensions via className. */
export function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/** Skeleton for a metric card (label + value + change). */
export function MetricCardSkeleton() {
  return (
    <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6">
      <Skeleton className="h-4 w-24 mb-3" />
      <Skeleton className="h-8 w-32 mb-2" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

/** Skeleton for a chart card (title + chart area). */
export function ChartCardSkeleton() {
  return (
    <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
      <Skeleton className="h-4 w-32 mb-1" />
      <Skeleton className="h-3 w-20 mb-6" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  );
}

/** Skeleton for a table row. */
export function TableRowSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <tr>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className={`h-4 ${i === 0 ? "w-32" : "w-20"}`} />
        </td>
      ))}
    </tr>
  );
}

/** Skeleton for a full page with header + grid of cards. */
export function PageSkeleton() {
  return (
    <div className="animate-fade-in">
      <Skeleton className="h-8 w-48 mb-2" />
      <Skeleton className="h-4 w-64 mb-8" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <MetricCardSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCardSkeleton />
        <ChartCardSkeleton />
      </div>
    </div>
  );
}
