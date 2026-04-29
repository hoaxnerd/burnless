"use client";

/**
 * CustomizableMetrics — renders the Key Metrics card with user-customizable
 * metric selection and mode-aware display using the shared DataTable component.
 */

import { useMemo } from "react";
import { LayoutGrid } from "lucide-react";
import {
  getMetricDef,
  extractMetricValue,
  formatMetricValue,
  evaluateBenchmark,
  isMetricDataAvailable,
  getMetricMissingDataHint,
  DEFAULT_SECONDARY_METRICS,
  type ComputedMetrics,
} from "@burnless/engine";
import { useMetrics } from "@/components/providers/metrics-context";
import { useDashboardLayout } from "./dashboard-layout-context";
import { DataTable } from "@/components/ui/data-table";
import { Sparkline } from "@/components/ui/hero-kpi-card";
import { sparkline } from "./dashboard-helpers";
import { useLocale } from "@/components/locale/locale-context";

// ── Row data type for the DataTable ─────────────────────────────────────────

interface MetricRow {
  slug: string;
  name: string;
  description: string;
  value: string;
  numericValue: number;
  change: string | null;
  changeDirection: "positive" | "negative" | "neutral";
  lowerIsBetter: boolean;
  benchmarkLabel: string | null;
  benchmarkStatus: "good" | "warn" | "bad" | null;
  sparkData: number[] | undefined;
  hasData: boolean;
  hint: string | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Determine sparkline color based on metric direction and change */
/** Design tokens: success-500 (#10b981), danger-500 (#ef4444), surface-400 (#9ca3af)
 *  Hex required for SVG gradient stopColor compatibility */
function sparkColor(direction: "positive" | "negative" | "neutral", lowerIsBetter: boolean): string {
  if (direction === "neutral") return "#9ca3af";
  if (lowerIsBetter) return direction === "positive" ? "#ef4444" : "#10b981";
  return direction === "positive" ? "#10b981" : "#ef4444";
}

function changeClass(direction: "positive" | "negative" | "neutral", lowerIsBetter: boolean): string {
  if (direction === "neutral") return "text-surface-400";
  if (lowerIsBetter) return direction === "positive" ? "text-danger-500" : "text-success-500";
  return direction === "positive" ? "text-success-500" : "text-danger-500";
}

function benchmarkClass(status: "good" | "warn" | "bad"): string {
  if (status === "good") return "text-success-500";
  if (status === "warn") return "text-warning-500";
  return "text-danger-500";
}

// ── Component ───────────────────────────────────────────────────────────────

interface CustomizableMetricsProps {
  metrics: ComputedMetrics;
  currentMonth: string;
  prevMonth: string;
  headcount?: { current: number; previous: number };
}

export function CustomizableMetrics({
  metrics,
  currentMonth,
  prevMonth,
}: CustomizableMetricsProps) {
  const { setCatalogOpen, openFormulaViewer } = useMetrics();
  const { secondaryMetrics } = useDashboardLayout();
  const { fmtCurrency } = useLocale();

  const activeMetrics = secondaryMetrics.length > 0 ? secondaryMetrics : DEFAULT_SECONDARY_METRICS;

  // Build table rows from metric slugs
  const rows: MetricRow[] = useMemo(() => {
    return activeMetrics
      .map((slug) => {
        const def = getMetricDef(slug);
        if (!def) return null;

        const hasData = isMetricDataAvailable(metrics, slug, currentMonth);
        const hint = hasData ? null : (getMetricMissingDataHint(slug) ?? null);

        if (!hasData) {
          return {
            slug,
            name: def.name,
            description: def.description ?? "",
            value: "—",
            numericValue: 0,
            change: null,
            changeDirection: "neutral" as const,
            lowerIsBetter: def.direction === "lower_better",
            benchmarkLabel: null,
            benchmarkStatus: null,
            sparkData: undefined,
            hasData: false,
            hint,
          };
        }

        const currentVal = extractMetricValue(metrics, slug, currentMonth) ?? 0;
        const prevVal = extractMetricValue(metrics, slug, prevMonth) ?? 0;

        if (!Number.isFinite(currentVal)) return null;

        const formattedValue = def.format === "currency"
          ? fmtCurrency(currentVal, { compact: true })
          : formatMetricValue(currentVal, def.format);

        // Calculate change
        let change: string | null = null;
        if (def.format === "percent") {
          const diff = currentVal - prevVal;
          if (prevVal !== 0 && diff !== 0 && Number.isFinite(diff)) {
            change = `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}pp`;
          }
        } else if (def.format === "number") {
          const diff = currentVal - prevVal;
          if (prevVal !== 0 && diff !== 0 && Number.isFinite(diff)) {
            change = `${diff >= 0 ? "+" : ""}${Number.isInteger(diff) ? diff : diff.toFixed(1)}`;
          }
        } else if (prevVal !== 0) {
          const pct = ((currentVal - prevVal) / Math.abs(prevVal)) * 100;
          if (pct !== 0 && Number.isFinite(pct)) {
            change = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
          }
        }

        const changeDirection: "positive" | "negative" | "neutral" =
          !change ? "neutral" : change.startsWith("+") ? "positive" : change.startsWith("-") ? "negative" : "neutral";

        const benchmarkSignal = evaluateBenchmark(currentVal, def);
        const benchmarkLabel = def.benchmark ? def.benchmark.label : null;
        const benchmarkStatus = def.benchmark ? (benchmarkSignal ?? "good") : null;

        // Sparkline data
        const series = (metrics as unknown as Record<string, Array<{ month: string; value: number }>>)[slug];
        const sparkData = Array.isArray(series) ? sparkline(series, 8, currentMonth) : undefined;

        return {
          slug,
          name: def.name,
          description: def.description ?? "",
          value: formattedValue,
          numericValue: currentVal,
          change,
          changeDirection,
          lowerIsBetter: def.direction === "lower_better",
          benchmarkLabel,
          benchmarkStatus,
          sparkData,
          hasData: true,
          hint: null,
        };
      })
      .filter((r) => r !== null) as MetricRow[];
  }, [activeMetrics, metrics, currentMonth, prevMonth, fmtCurrency]);

  const columns = useMemo(
    () => [
      {
        key: "name",
        header: "Metric",
        className: "w-0 whitespace-nowrap",
        render: (row: MetricRow) => (
          <span className={`text-sm ${row.hasData ? "text-surface-700" : "text-surface-400"}`}>
            {row.name}
          </span>
        ),
        sortValue: (row: MetricRow) => row.name,
      },
      {
        key: "value",
        header: "Value",
        align: "right" as const,
        className: "w-0 whitespace-nowrap",
        render: (row: MetricRow) =>
          row.hasData ? (
            <span className="text-sm font-semibold text-surface-900 tabular-nums">
              {row.value}
            </span>
          ) : (
            <span className="text-xs text-surface-300 italic">{row.hint}</span>
          ),
        sortValue: (row: MetricRow) => row.numericValue,
      },
      {
        key: "change",
        header: "MoM",
        align: "right" as const,
        className: "w-0 whitespace-nowrap",
        render: (row: MetricRow) => (
          <span className={`text-xs font-medium tabular-nums ${
            row.change ? changeClass(row.changeDirection, row.lowerIsBetter) : "text-surface-300"
          }`}>
            {row.change ?? "—"}
          </span>
        ),
        sortValue: (row: MetricRow) => row.numericValue,
      },
      {
        key: "benchmark",
        header: "Benchmark",
        align: "right" as const,
        className: "w-0 whitespace-nowrap",
        render: (row: MetricRow) => (
          <span className={`text-xs tabular-nums ${
            row.benchmarkStatus ? benchmarkClass(row.benchmarkStatus) : "text-surface-300"
          }`}>
            {row.benchmarkLabel ?? ""}
          </span>
        ),
      },
      {
        key: "trend",
        header: "Trend",
        render: (row: MetricRow) =>
          row.sparkData && row.sparkData.length >= 2 ? (
            <Sparkline
              data={row.sparkData}
              color={sparkColor(row.changeDirection, row.lowerIsBetter)}
              height={24}
              fluid
            />
          ) : null,
      },
    ],
    []
  );

  return (
    <div className="h-full flex flex-col rounded-2xl bg-surface-0 border border-surface-200 p-5 sm:p-6 animate-slide-up stagger-6 hover-lift">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-surface-900">Key Metrics</h2>
        <button
          onClick={() => setCatalogOpen(true, "secondary")}
          className="flex items-center gap-1 text-xs font-medium text-brand-500 hover:text-brand-600 transition-colors"
        >
          <LayoutGrid className="h-3 w-3" />
          Customize
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <DataTable
          columns={columns}
          data={rows}
          rowKey={(row) => row.slug}
          compact
          onRowClick={(row) => openFormulaViewer(row.slug)}
          emptyMessage="No metrics configured"
        />
      </div>
    </div>
  );
}
