"use client";

import { withLazyChart } from "./lazy-chart";
import type { ComponentProps } from "react";

// Re-export types for consumers that need them
type AreaChartWidgetProps = ComponentProps<typeof LazyAreaChartWidget>;
type BarChartWidgetProps = ComponentProps<typeof LazyBarChartWidget>;
type VarianceBarChartProps = ComponentProps<typeof LazyVarianceBarChart>;
type MultiLineChartProps = ComponentProps<typeof LazyMultiLineChart>;

export const LazyAreaChartWidget = withLazyChart(
  () => import("./area-chart").then((m) => ({ default: m.AreaChartWidget }))
);

export const LazyBarChartWidget = withLazyChart(
  () => import("./bar-chart").then((m) => ({ default: m.BarChartWidget }))
);

export const LazyVarianceBarChart = withLazyChart(
  () => import("./bar-chart").then((m) => ({ default: m.VarianceBarChart }))
);

export const LazyMultiLineChart = withLazyChart(
  () => import("./multi-line-chart").then((m) => ({ default: m.MultiLineChart }))
);

export type {
  AreaChartWidgetProps,
  BarChartWidgetProps,
  VarianceBarChartProps,
  MultiLineChartProps,
};
