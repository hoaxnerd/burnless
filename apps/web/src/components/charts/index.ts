// Lazy-loaded chart components — recharts is only fetched when a chart renders
export {
  LazyAreaChartWidget as AreaChartWidget,
  LazyBarChartWidget as BarChartWidget,
  LazyVarianceBarChart as VarianceBarChart,
  LazyMultiLineChart as MultiLineChart,
} from "./lazy-exports";

// Theme utilities — no recharts dependency, safe to import anywhere
export {
  chartColors,
  chartDefaults,
  tooltipStyle,
  formatCompactCurrency,
  formatPercent,
  formatNumber,
  formatMonth,
  formatMonthYear,
} from "./chart-theme";
export { withLazyChart, ChartSkeleton } from "./lazy-chart";
