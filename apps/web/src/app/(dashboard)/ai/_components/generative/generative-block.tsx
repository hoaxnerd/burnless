"use client";
import type { UiBlockClient } from "../types";
import { GenMetricCard, type GenMetricCardProps } from "./metric-card";
import { GenKpiGrid, type GenKpiGridProps } from "./kpi-grid";
import { GenLineChart, type GenLineChartProps } from "./line-chart";
import { GenBarChart, type GenBarChartProps } from "./bar-chart";
import { GenAreaChart, type GenAreaChartProps } from "./area-chart";
import { GenRunway, type GenRunwayProps } from "./runway";
import { GenCapTable, type GenCapTableProps } from "./cap-table";
import { GenScenarioDiff, type GenScenarioDiffProps } from "./scenario-diff";
import { GenFundingSummary, type GenFundingSummaryProps } from "./funding-summary";
import { GenDataTable, type GenDataTableProps } from "./data-table";

export interface GenerativeBlockProps {
  component: string;
  props: Record<string, unknown>;
}

/**
 * Dispatches a server-emitted display component to its renderer.
 * Unknown names render a safe fallback (never throw — the model may emit a
 * component this client build doesn't know yet).
 */
export function GenerativeBlock({ component, props }: GenerativeBlockProps) {
  switch (component) {
    case "metric_card":
      return <GenMetricCard {...(props as unknown as GenMetricCardProps)} />;
    case "kpi_grid":
      return <GenKpiGrid {...(props as unknown as GenKpiGridProps)} />;
    case "line_chart":
      return <GenLineChart {...(props as unknown as GenLineChartProps)} />;
    case "bar_chart":
      return <GenBarChart {...(props as unknown as GenBarChartProps)} />;
    case "area_chart":
      return <GenAreaChart {...(props as unknown as GenAreaChartProps)} />;
    case "runway":
      return <GenRunway {...(props as unknown as GenRunwayProps)} />;
    case "cap_table":
      return <GenCapTable {...(props as unknown as GenCapTableProps)} />;
    case "scenario_diff":
      return <GenScenarioDiff {...(props as unknown as GenScenarioDiffProps)} />;
    case "funding_summary":
      return <GenFundingSummary {...(props as unknown as GenFundingSummaryProps)} />;
    case "data_table":
      return <GenDataTable {...(props as unknown as GenDataTableProps)} />;
    // component cases are added by each component task below.
    default:
      return (
        <div className="my-2 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-xs text-surface-500">
          Unsupported component: {component}
        </div>
      );
  }
}

/** Render all display blocks attached to a message. */
export function GenerativeBlocks({ blocks }: { blocks: UiBlockClient[] }) {
  return (
    <>
      {blocks.map((b) => (
        <GenerativeBlock key={b.id} component={b.component} props={b.props} />
      ))}
    </>
  );
}
