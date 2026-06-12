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
import { GenCallout, type GenCalloutProps } from "./callout";
import { GenComparisonTable, type GenComparisonTableProps } from "./comparison-table";
import { GenChecklist, type GenChecklistProps } from "./checklist";
import { GenSuggestedActions, type GenSuggestedActionsProps } from "./suggested-actions";
import { GenProgressSteps, type GenProgressStepsProps } from "./progress-steps";
import { GenProposeScheduledJob, type GenProposeScheduledJobProps } from "./propose-scheduled-job";
import { ConfidenceChip } from "./confidence-chip";

export interface GenerativeBlockProps {
  component: string;
  props: Record<string, unknown>;
  /**
   * Optional callback for interactive display components (e.g. suggested_actions)
   * to trigger a follow-up chat turn. Display-only components ignore it.
   */
  onAction?: (prompt: string) => void;
}

/**
 * Dispatches a server-emitted display component to its renderer.
 * Unknown names render a safe fallback (never throw — the model may emit a
 * component this client build doesn't know yet).
 */
export function GenerativeBlock({ component, props, onAction }: GenerativeBlockProps) {
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
    case "callout":
      return <GenCallout {...(props as unknown as GenCalloutProps)} />;
    case "comparison_table":
      return <GenComparisonTable {...(props as unknown as GenComparisonTableProps)} />;
    case "checklist":
      return <GenChecklist {...(props as unknown as GenChecklistProps)} />;
    case "suggested_actions": {
      const p = props as unknown as GenSuggestedActionsProps;
      return <GenSuggestedActions actions={p.actions} onAction={onAction} />;
    }
    case "progress_steps":
      return <GenProgressSteps {...(props as unknown as GenProgressStepsProps)} />;
    case "propose_scheduled_job":
      return (
        <GenProposeScheduledJob
          {...(props as unknown as GenProposeScheduledJobProps)}
          onAction={onAction}
        />
      );
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
export function GenerativeBlocks({
  blocks,
  onAction,
}: {
  blocks: UiBlockClient[];
  onAction?: (prompt: string) => void;
}) {
  return (
    <>
      {blocks.map((b) => (
        <div key={b.id}>
          <GenerativeBlock component={b.component} props={b.props} onAction={onAction} />
          <ConfidenceChip confidence={b.confidence} rationale={b.rationale} />
        </div>
      ))}
    </>
  );
}
