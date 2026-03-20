"use client";

import { Suspense, lazy, type ComponentType } from "react";

interface LazyChartProps {
  fallbackHeight?: string;
}

/**
 * Loading placeholder for charts — shows a subtle shimmer while
 * the chart component loads. Uses CSS animation, no JS overhead.
 */
function ChartSkeleton({ height = "h-64" }: { height?: string }) {
  return (
    <div className={`${height} w-full rounded-lg bg-surface-100 animate-pulse`} role="status" aria-label="Loading chart">
      <span className="sr-only">Loading chart...</span>
    </div>
  );
}

/**
 * Wraps a dynamically imported chart component with a Suspense boundary
 * and loading skeleton. Use this to lazy-load heavy chart components.
 *
 * Usage:
 *   const LazyAreaChart = withLazyChart(() => import("./area-chart").then(m => ({ default: m.AreaChartWidget })));
 *   <LazyAreaChart data={data} color={color} />
 */
export function withLazyChart<P extends object>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
  fallbackHeight = "h-64"
) {
  const LazyComponent = lazy(importFn);

  return function LazyChart(props: P) {
    return (
      <Suspense fallback={<ChartSkeleton height={fallbackHeight} />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}

export { ChartSkeleton };
