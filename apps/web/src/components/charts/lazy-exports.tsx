"use client";

import { lazy, Suspense, type ComponentType } from "react";
import { ChartSkeleton } from "./lazy-chart";

// Lazy-loaded chart components with Suspense boundaries.
// Using React.lazy directly avoids generic inference issues with the
// withLazyChart wrapper when re-exporting named exports via .then().

const LazyArea = lazy(() =>
  import("./area-chart").then((m) => ({ default: m.AreaChartWidget }))
);

const LazyBar = lazy(() =>
  import("./bar-chart").then((m) => ({ default: m.BarChartWidget }))
);

const LazyVariance = lazy(() =>
  import("./bar-chart").then((m) => ({ default: m.VarianceBarChart }))
);

const LazyMulti = lazy(() =>
  import("./multi-line-chart").then((m) => ({ default: m.MultiLineChart }))
);

type PropsOf<C> = C extends ComponentType<infer P> ? P : never;

export type AreaChartWidgetProps = PropsOf<typeof LazyArea>;
export type BarChartWidgetProps = PropsOf<typeof LazyBar>;
export type VarianceBarChartProps = PropsOf<typeof LazyVariance>;
export type MultiLineChartProps = PropsOf<typeof LazyMulti>;

function wrap<P extends object>(Component: ComponentType<P>, height = "h-64") {
  return function LazyChart(props: P) {
    return (
      <Suspense fallback={<ChartSkeleton height={height} />}>
        <Component {...props} />
      </Suspense>
    );
  };
}

export const LazyAreaChartWidget = wrap(LazyArea);
export const LazyBarChartWidget = wrap(LazyBar);
export const LazyVarianceBarChart = wrap(LazyVariance);
export const LazyMultiLineChart = wrap(LazyMulti);
