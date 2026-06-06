/**
 * Server-side revenue detail computation — enriches dashboard data with
 * per-stream breakdowns, waterfall data, and growth trajectory analysis.
 */
import { cache } from "react";
import {
  seriesToArray,
  pctChange,
  ratioChange,
  type MetricValue,
} from "@burnless/engine";
import { getRevenueStreams } from "./data";
import { computeDashboardData } from "./compute-dashboard";
import { buildRevenueBreakdown } from "./breakdowns";

// ── Types ────────────────────────────────────────────────────────────────────

export interface StreamBreakdown {
  id: string;
  name: string;
  type: string;
  parameters: Record<string, unknown>;
  currentRevenue: number;
  prevRevenue: number;
  changePercent: number;
  percentage: number;
  monthlySeries: { month: string; value: number }[];
}

export interface WaterfallPoint {
  month: string;
  newMrr: number;
  expansionMrr: number;
  churnedMrr: number;
  netNewMrr: number;
}

export interface GrowthMetrics {
  currentMrr: number;
  prevMrr: number;
  mrrGrowthPercent: number;
  arr: number;
  currentRevenue: number;
  prevRevenue: number;
  revenueGrowthPercent: number;
  totalCustomers: number;
  churnRate: number;
  arpa: number;
  ltv: number;
  quickRatio: number;
  doublingTimeMonths: number | null;
}

export interface RevenueDetails {
  streamBreakdown: StreamBreakdown[];
  waterfall: WaterfallPoint[];
  growthMetrics: GrowthMetrics;
  hasSaaS: boolean;
  streamCount: number;
  monthlyByStream: Record<string, unknown>[];
  streamNames: string[];
}

// ── Main computation ─────────────────────────────────────────────────────────

export const computeRevenueDetails = cache(async function computeRevenueDetails(
  companyId: string,
  scenarioId: string,
  year?: number,
): Promise<RevenueDetails> {
  const [streams, dashData] = await Promise.all([
    getRevenueStreams(scenarioId),
    computeDashboardData(companyId, scenarioId, year),
  ]);

  // Single-source: streamBreakdown reconciles to blended totalRevenue incl. an
  // Imported/Other residual; waterfall/growthMetrics stay metric-derived.
  const { metrics, totalRevenue, currentMonth, prevMonth, revenueLines, revenueResidual } = dashData;
  const hasSaaS = streams.some((s) => s.type === "subscription");

  // Per-stream breakdown from the BLENDED source (streams + imported residual),
  // so it reconciles to totalRevenue rather than diverging when actuals exist.
  const currentTotal = Number(totalRevenue.get(currentMonth) ?? 0);
  const lineById = new Map(revenueLines.map((l) => [l.streamId, l]));
  const streamById = new Map(streams.map((s) => [s.id, s]));

  const streamBreakdowns: StreamBreakdown[] = buildRevenueBreakdown(
    revenueLines,
    revenueResidual,
    currentMonth,
    currentTotal,
  ).map((row): StreamBreakdown => {
    if (row.streamId === "imported") {
      const prev = Number(revenueResidual.get(prevMonth) ?? 0);
      return {
        id: "imported",
        name: row.name,
        type: "imported",
        parameters: {},
        currentRevenue: row.amount,
        prevRevenue: prev,
        changePercent: ratioChange(row.amount, prev) ?? 0,
        percentage: row.share,
        monthlySeries: seriesToArray(revenueResidual),
      };
    }
    const line = lineById.get(row.streamId);
    const stream = streamById.get(row.streamId);
    const prev = Number(line?.values.get(prevMonth) ?? 0);
    return {
      id: row.streamId,
      name: row.name,
      type: row.type,
      parameters: (stream?.parameters ?? {}) as Record<string, unknown>,
      currentRevenue: row.amount,
      prevRevenue: prev,
      changePercent: ratioChange(row.amount, prev) ?? 0,
      percentage: row.share,
      monthlySeries: line ? seriesToArray(line.values) : [],
    };
  });

  // Build waterfall from metrics
  const waterfall: WaterfallPoint[] = [];
  if (hasSaaS) {
    const months = new Set<string>();
    for (const m of metrics.newMrr) months.add(m.month);
    const sortedMonths = Array.from(months).sort();

    for (const month of sortedMonths) {
      waterfall.push({
        month,
        newMrr: metrics.newMrr.find((m) => m.month === month)?.value ?? 0,
        expansionMrr: metrics.expansionMrr.find((m) => m.month === month)?.value ?? 0,
        churnedMrr: Math.abs(metrics.churnedMrr.find((m) => m.month === month)?.value ?? 0),
        netNewMrr: metrics.netNewMrr.find((m) => m.month === month)?.value ?? 0,
      });
    }
  }

  // Growth metrics
  const currentMrr = findMetricValue(metrics.mrr, currentMonth);
  const prevMrr = findMetricValue(metrics.mrr, prevMonth);
  const mrrGrowth = pctChange(currentMrr, prevMrr) ?? 0;
  const currentRev = Number(totalRevenue.get(currentMonth) ?? 0);
  const prevRev = Number(totalRevenue.get(prevMonth) ?? 0);
  const revGrowth = pctChange(currentRev, prevRev) ?? 0;

  const quickRatio = findMetricValue(metrics.saasQuickRatio, currentMonth);

  // Doubling time: months = ln(2) / ln(1 + monthly_growth_rate)
  const monthlyRate = mrrGrowth / 100;
  const doublingTime = monthlyRate > 0 ? Math.log(2) / Math.log(1 + monthlyRate) : null;

  const growthMetrics: GrowthMetrics = {
    currentMrr,
    prevMrr,
    mrrGrowthPercent: mrrGrowth,
    arr: currentMrr * 12,
    currentRevenue: currentRev,
    prevRevenue: prevRev,
    revenueGrowthPercent: revGrowth,
    totalCustomers: findMetricValue(metrics.totalCustomers, currentMonth),
    churnRate: findMetricValue(metrics.customerChurnRate, currentMonth),
    arpa: findMetricValue(metrics.arpa, currentMonth),
    ltv: findMetricValue(metrics.ltv, currentMonth),
    quickRatio,
    doublingTimeMonths: doublingTime,
  };

  // Monthly by stream for stacked chart
  const allMonths = new Set<string>();
  for (const sb of streamBreakdowns) {
    for (const pt of sb.monthlySeries) allMonths.add(pt.month);
  }
  const sortedMonths = Array.from(allMonths).sort();
  const streamNames = streamBreakdowns.map((s) => s.name);

  const monthlyByStream = sortedMonths.map((month) => {
    const row: Record<string, unknown> = { month };
    for (const sb of streamBreakdowns) {
      const pt = sb.monthlySeries.find((p) => p.month === month);
      row[sb.name] = pt?.value ?? 0;
    }
    return row;
  });

  return {
    streamBreakdown: streamBreakdowns,
    waterfall,
    growthMetrics,
    hasSaaS,
    streamCount: streams.length,
    monthlyByStream,
    streamNames,
  };
});

function findMetricValue(metrics: MetricValue[], month: string): number {
  return metrics.find((m) => m.month === month)?.value ?? 0;
}
