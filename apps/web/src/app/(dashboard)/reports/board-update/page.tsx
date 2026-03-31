export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import { getCompany, getActiveScenario, getFundingRounds } from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { computeRevenueDetails } from "@/lib/compute-revenue";
import { computeExpenseDetails } from "@/lib/compute-expenses";
import { seriesToArray, monthKey, METRIC_REGISTRY } from "@burnless/engine";
import type { ResolvedSlotData } from "@burnless/engine";
import { buildSlotMetricCard } from "@/lib/build-slot-metrics";
import { BoardUpdateView } from "./board-update-view";
import { SetupPrompt, ScenarioPrompt } from "@/components/ui/empty-state";
import { ReportContentSkeleton } from "@/components/reports/report-skeleton";

export default async function BoardUpdatePage({
  searchParams,
}: {
  searchParams: Promise<{ scenarioId?: string }>;
}) {
  const params = await searchParams;
  const company = await getCompany();
  if (!company) return <SetupPrompt context="generating reports" />;

  const scenario = await getActiveScenario(company.id, params.scenarioId);
  if (!scenario) return <ScenarioPrompt context="generate reports" />;

  return (
    <Suspense fallback={<ReportContentSkeleton />}>
      <BoardUpdateContent companyId={company.id} scenarioId={scenario.id} companyName={company.name} scenarioName={scenario.name} />
    </Suspense>
  );
}

async function BoardUpdateContent({ companyId, scenarioId, companyName, scenarioName }: { companyId: string; scenarioId: string; companyName: string; scenarioName: string }) {
  const [data, revenueDetails, expenseDetails, funding] = await Promise.all([
    computeDashboardData(companyId, scenarioId),
    computeRevenueDetails(companyId, scenarioId),
    computeExpenseDetails(companyId, scenarioId),
    getFundingRounds(companyId),
  ]);

  const { metrics, currentMonth, totalRevenue, totalExpenses, netIncome, cashPosition, profitAndLoss } = data;
  const now = new Date();
  const prevMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  const currentRev = totalRevenue.get(currentMonth) ?? 0;
  const prevRev = totalRevenue.get(prevMonth) ?? 0;
  const revGrowth = prevRev > 0 ? ((currentRev - prevRev) / prevRev * 100) : 0;

  const currentExp = totalExpenses.get(currentMonth) ?? 0;
  const prevExp = totalExpenses.get(prevMonth) ?? 0;
  const expChange = prevExp > 0 ? ((currentExp - prevExp) / prevExp * 100) : 0;

  const currentNet = netIncome.get(currentMonth) ?? 0;
  const currentCash = cashPosition.get(currentMonth) ?? 0;

  const burnRate = metrics.burnRate.find((m) => m.month === currentMonth)?.value ?? 0;
  const runway = metrics.cashRunwayMonths.find((m) => m.month === currentMonth)?.value ?? 0;
  const grossMargin = metrics.grossMarginPercent.find((m) => m.month === currentMonth)?.value ?? 0;

  const g = revenueDetails.growthMetrics;
  const totalFunding = funding.reduce((sum, r) => sum + Number(r.amount), 0);

  const boardData = {
    companyName,
    scenarioName,
    reportMonth: currentMonth,
    revenue: {
      current: currentRev,
      previous: prevRev,
      growthPercent: revGrowth,
      mrr: g.currentMrr,
      arr: g.arr,
      customers: g.totalCustomers,
      churnRate: g.churnRate,
      arpa: g.arpa,
      hasSaaS: revenueDetails.hasSaaS,
      streamCount: revenueDetails.streamCount,
    },
    expenses: {
      current: currentExp,
      previous: prevExp,
      changePercent: expChange,
      topCategories: expenseDetails.subcategoryBreakdown.slice(0, 5),
      anomalyCount: expenseDetails.anomalyCount,
    },
    cash: {
      position: currentCash,
      burnRate,
      runway,
      totalFunding,
      netIncome: currentNet,
    },
    profitability: {
      grossMargin,
      netIncome: currentNet,
      netMargin: currentRev > 0 ? (currentNet / currentRev * 100) : 0,
    },
    revenueTimeline: seriesToArray(totalRevenue),
    expenseTimeline: seriesToArray(totalExpenses),
    cashTimeline: seriesToArray(cashPosition),
    pnlSummary: {
      revenue: profitAndLoss.revenue.values,
      cogs: profitAndLoss.cogs.values,
      grossProfit: profitAndLoss.grossProfit.values,
      opex: profitAndLoss.operatingExpenses.values,
      netIncome: profitAndLoss.netIncome.values,
    },
  };

  // Build resolved slot data for ALL engine metrics (swap targets)
  const allEngineSlots: ResolvedSlotData[] = METRIC_REGISTRY.map((def) =>
    buildSlotMetricCard(def.slug, data.metrics, currentMonth, prevMonth)
  );

  // Build page-specific default KPI cards as ResolvedSlotData
  const pageDefaultSlots: ResolvedSlotData[] = [
    {
      slotId: "metric-0",
      content: { type: "metric", slug: "revenue" },
      label: "Revenue",
      value: `$${currentRev >= 1_000_000 ? `${(currentRev / 1_000_000).toFixed(1)}M` : currentRev >= 1_000 ? `${(currentRev / 1_000).toFixed(0)}k` : currentRev.toFixed(0)}`,
      change: `${revGrowth > 0 ? "+" : ""}${revGrowth.toFixed(1)}%`,
      changeLabel: "MoM",
      hasData: currentRev > 0,
      metricStyle: { icon: "DollarSign", color: "text-surface-500", href: "/revenue" },
    },
    {
      slotId: "metric-1",
      content: { type: "metric", slug: "netBurn" },
      label: "Net Burn",
      value: `$${burnRate >= 1_000_000 ? `${(burnRate / 1_000_000).toFixed(1)}M` : burnRate >= 1_000 ? `${(burnRate / 1_000).toFixed(0)}k` : burnRate.toFixed(0)}`,
      description: "/month",
      hasData: burnRate > 0,
      metricStyle: { icon: "TrendingDown", color: "text-warning-500", href: "/reports/runway" },
    },
    {
      slotId: "metric-2",
      content: { type: "metric", slug: "cash" },
      label: "Cash",
      value: `$${currentCash >= 1_000_000 ? `${(currentCash / 1_000_000).toFixed(1)}M` : currentCash >= 1_000 ? `${(currentCash / 1_000).toFixed(0)}k` : currentCash.toFixed(0)}`,
      description: runway > 36 ? "36+ mo runway" : `${Math.round(runway)} mo runway`,
      hasData: currentCash > 0,
      metricStyle: { icon: "DollarSign", color: "text-brand-500", href: "/reports/runway" },
    },
    {
      slotId: "metric-3",
      content: { type: "metric", slug: "grossMargin" },
      label: "Gross Margin",
      value: `${grossMargin.toFixed(1)}%`,
      description: grossMargin >= 60 ? "Healthy" : grossMargin >= 40 ? "Average" : "Below benchmark",
      hasData: true,
      metricStyle: { icon: "BarChart3", color: "text-surface-500", href: "/reports/profit-loss" },
    },
  ];

  const resolvedSlotData = [...pageDefaultSlots, ...allEngineSlots];

  return (
    <div>
      <BoardUpdateView data={boardData} resolvedSlotData={resolvedSlotData} />
    </div>
  );
}
