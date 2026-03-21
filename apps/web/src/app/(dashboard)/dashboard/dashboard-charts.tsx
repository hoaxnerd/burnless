"use client";

import { useState, useCallback, useEffect } from "react";
import { ChevronDown, Maximize2, X } from "lucide-react";
import {
  AreaChartWidget,
  BarChartWidget,
  MultiLineChart,
  chartColors,
  formatCompactCurrency,
} from "@/components/charts";

interface MetricPoint {
  month: string;
  value: number;
}

interface DashboardChartsProps {
  revenueVsExpenses: Array<{ month: string; revenue: number; expenses: number }>;
  cashData: MetricPoint[];
  burnData: MetricPoint[];
  runwayData: MetricPoint[];
  mrrData: MetricPoint[];
  hasSaaS: boolean;
}

/* ── Expanded Chart Modal ────────────────────────────────────────────────── */

function ChartExpandModal({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="bg-surface-0 rounded-2xl border border-surface-200 shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-auto p-6 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-surface-900">{title}</h3>
            <p className="mt-0.5 text-sm text-surface-400">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400 hover:text-surface-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Chart Card — collapsible on mobile, click-to-expand on desktop ──── */

function DashboardChartCard({
  title,
  subtitle,
  children,
  expandedChildren,
  stagger = 0,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  /** Content to render in expanded modal (defaults to children with taller height) */
  expandedChildren?: React.ReactNode;
  stagger?: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleExpand = useCallback(() => setExpanded(true), []);
  const handleClose = useCallback(() => setExpanded(false), []);

  return (
    <>
      <div
        className={`
          rounded-2xl bg-surface-0 border border-surface-200
          p-5 sm:p-6
          hover:border-surface-300 hover:shadow-md
          transition-all duration-300
          animate-slide-up stagger-${stagger}
        `}
      >
        {/* Header — collapsible toggle on mobile, expand button on desktop */}
        <div className="flex items-center justify-between mb-4">
          {/* Mobile: entire header is a collapse toggle */}
          <button
            className="flex items-center gap-2 lg:hidden text-left"
            onClick={() => setCollapsed(!collapsed)}
          >
            <div>
              <h3 className="text-sm font-semibold text-surface-900">{title}</h3>
              <p className="mt-0.5 text-xs text-surface-400">{subtitle}</p>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-surface-400 transition-transform duration-200 ${
                collapsed ? "-rotate-90" : ""
              }`}
            />
          </button>

          {/* Desktop: static header */}
          <div className="hidden lg:block">
            <h3 className="text-sm font-semibold text-surface-900">{title}</h3>
            <p className="mt-0.5 text-xs text-surface-400">{subtitle}</p>
          </div>

          {/* Expand button — desktop only */}
          <button
            onClick={handleExpand}
            className="hidden lg:flex items-center gap-1 text-xs text-surface-400 hover:text-surface-600 transition-colors p-1 rounded-md hover:bg-surface-100"
            title="Expand chart"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Chart content — collapsible on mobile */}
        <div
          className={`transition-all duration-300 overflow-hidden ${
            collapsed ? "max-h-0 opacity-0" : "max-h-[500px] opacity-100"
          } lg:max-h-none lg:opacity-100`}
        >
          {children}
        </div>
      </div>

      {/* Expanded modal */}
      {expanded && (
        <ChartExpandModal title={title} subtitle={subtitle} onClose={handleClose}>
          {expandedChildren ?? children}
        </ChartExpandModal>
      )}
    </>
  );
}

export function DashboardCharts({
  revenueVsExpenses,
  cashData,
  burnData,
  runwayData,
  mrrData,
  hasSaaS,
}: DashboardChartsProps) {
  const burnRunwayCombined = burnData.map((b, i) => ({
    month: b.month,
    burn: b.value,
    runway: runwayData[i]?.value ?? 0,
  }));

  const revExpBars = [
    { dataKey: "revenue", label: "Revenue", color: chartColors.brand },
    { dataKey: "expenses", label: "Expenses", color: chartColors.danger },
  ] as const;

  const burnRunwayLines = [
    { dataKey: "burn", label: "Net Burn", color: chartColors.danger },
    { dataKey: "runway", label: "Runway (mo)", color: chartColors.info, dashed: true },
  ] as const;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <DashboardChartCard
          title="Cash Position"
          subtitle="Cash balance over time"
          stagger={1}
          expandedChildren={
            <AreaChartWidget data={cashData} color={chartColors.success} height={420} />
          }
        >
          <AreaChartWidget data={cashData} color={chartColors.success} />
        </DashboardChartCard>

        <DashboardChartCard
          title="Revenue vs Expenses"
          subtitle="Monthly comparison"
          stagger={2}
          expandedChildren={
            <BarChartWidget data={revenueVsExpenses} bars={[...revExpBars]} height={420} />
          }
        >
          <BarChartWidget data={revenueVsExpenses} bars={[...revExpBars]} />
        </DashboardChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <DashboardChartCard
          title="Burn Rate & Runway"
          subtitle="Net burn and months of runway"
          stagger={3}
          expandedChildren={
            <MultiLineChart
              data={burnRunwayCombined}
              lines={[...burnRunwayLines]}
              formatValue={formatCompactCurrency}
              height={420}
            />
          }
        >
          <MultiLineChart
            data={burnRunwayCombined}
            lines={[...burnRunwayLines]}
            formatValue={formatCompactCurrency}
          />
        </DashboardChartCard>

        {hasSaaS ? (
          <DashboardChartCard
            title="MRR"
            subtitle="Monthly recurring revenue"
            stagger={4}
            expandedChildren={
              <AreaChartWidget data={mrrData} color="#7c3aed" height={420} />
            }
          >
            <AreaChartWidget data={mrrData} color="#7c3aed" />
          </DashboardChartCard>
        ) : (
          <DashboardChartCard
            title="Revenue Trend"
            subtitle="Total monthly revenue"
            stagger={4}
            expandedChildren={
              <AreaChartWidget data={cashData} color={chartColors.brand} height={420} />
            }
          >
            <AreaChartWidget data={cashData} color={chartColors.brand} />
          </DashboardChartCard>
        )}
      </div>
    </div>
  );
}
