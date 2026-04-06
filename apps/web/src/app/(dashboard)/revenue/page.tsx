export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import { getCompany, getActiveScenario } from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { computeRevenueDetails } from "@/lib/compute-revenue";
import { seriesToArray, monthKey, METRIC_REGISTRY } from "@burnless/engine";
import type { ResolvedSlotData } from "@burnless/engine";
import { buildSlotMetricCard } from "@/lib/build-slot-metrics";
import { formatCurrency } from "@burnless/types";
import { RevenueView } from "./revenue-view";
import { AddRevenueStreamForm } from "./add-revenue-stream-form";
import { SetupPrompt, ScenarioPrompt, RevenueEmptyState } from "@/components/ui/empty-state";
import { ReportContentSkeleton } from "@/components/reports/report-skeleton";

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ scenarioId?: string }>;
}) {
  const params = await searchParams;
  const company = await getCompany();
  if (!company) return <SetupPrompt context="modeling revenue" />;

  const scenario = await getActiveScenario(company.id, params.scenarioId);
  if (!scenario) return <ScenarioPrompt context="model revenue" />;

  return (
    <Suspense fallback={<ReportContentSkeleton />}>
      <RevenueContent companyId={company.id} scenarioId={scenario.id} />
    </Suspense>
  );
}

async function RevenueContent({ companyId, scenarioId }: { companyId: string; scenarioId: string }) {
  const [data, revenueDetails] = await Promise.all([
    computeDashboardData(companyId, scenarioId),
    computeRevenueDetails(companyId, scenarioId),
  ]);

  // Show empty state if no revenue streams exist
  if (revenueDetails.streamCount === 0) {
    return (
      <div>
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-surface-900">Revenue</h1>
            <p className="mt-1 text-sm text-surface-500">
              Your growth story &mdash; MRR, streams, waterfall, and AI projections
            </p>
          </div>
          <AddRevenueStreamForm scenarioId={scenarioId} />
        </div>
        <RevenueEmptyState />
      </div>
    );
  }

  const revenueTimeline = seriesToArray(data.totalRevenue);
  const mrrTimeline = data.metrics.mrr;

  const { currentMonth } = data;
  const now = new Date();
  const prevMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const g = revenueDetails.growthMetrics;
  const fc = (v: number) => formatCurrency(v, "USD", undefined, { compact: true });

  const spark = (series: { month: string; value: number }[]) => {
    const vals = series.slice(-8).map(t => t.value);
    return vals.length >= 2 ? vals : undefined;
  };

  // Build resolved slot data for ALL engine metrics (swap targets)
  const allEngineSlots: ResolvedSlotData[] = METRIC_REGISTRY.map((def) =>
    buildSlotMetricCard(def.slug, data.metrics, currentMonth, prevMonth)
  );

  // Build page-specific default cards as ResolvedSlotData
  const pageDefaultSlots: ResolvedSlotData[] = revenueDetails.hasSaaS
    ? [
        {
          slotId: "metric-0",
          content: { type: "metric", slug: "monthlyRevenue" },
          label: "Monthly Revenue",
          value: fc(g.currentRevenue),
          change: g.revenueGrowthPercent !== 0 ? `${g.revenueGrowthPercent > 0 ? "+" : ""}${g.revenueGrowthPercent.toFixed(1)}%` : undefined,
          changeLabel: "MoM growth",
          hasData: g.currentRevenue > 0,
          sparkData: spark(revenueTimeline),
          metricStyle: { icon: "DollarSign", color: "emerald", href: "/revenue" },
        },
        {
          slotId: "metric-1",
          content: { type: "metric", slug: "mrr" },
          label: "MRR",
          value: fc(g.currentMrr),
          change: g.mrrGrowthPercent !== 0 ? `${g.mrrGrowthPercent > 0 ? "+" : ""}${g.mrrGrowthPercent.toFixed(1)}%` : undefined,
          description: `ARR: ${fc(g.arr)}`,
          hasData: g.currentMrr > 0,
          sparkData: spark(mrrTimeline),
          metricStyle: { icon: "TrendingUp", color: "teal", href: "/revenue" },
        },
        {
          slotId: "metric-2",
          content: { type: "metric", slug: "customers" },
          label: "Customers",
          value: String(Math.round(g.totalCustomers)),
          description: `ARPA: ${fc(g.arpa)}/mo`,
          hasData: g.totalCustomers > 0,
          metricStyle: { icon: "Users", color: "blue", href: "/revenue" },
        },
        {
          slotId: "metric-3",
          content: { type: "metric", slug: "churnRate" },
          label: "Churn Rate",
          value: `${g.churnRate.toFixed(1)}%`,
          description: `LTV: ${fc(g.ltv)}`,
          hasData: true,
          metricStyle: { icon: "Flame", color: "orange", href: "/revenue" },
        },
      ]
    : [
        {
          slotId: "metric-0",
          content: { type: "metric", slug: "monthlyRevenue" },
          label: "Monthly Revenue",
          value: fc(g.currentRevenue),
          change: g.revenueGrowthPercent !== 0 ? `${g.revenueGrowthPercent > 0 ? "+" : ""}${g.revenueGrowthPercent.toFixed(1)}%` : undefined,
          changeLabel: "MoM growth",
          hasData: g.currentRevenue > 0,
          sparkData: spark(revenueTimeline),
          metricStyle: { icon: "DollarSign", color: "emerald", href: "/revenue" },
        },
        {
          slotId: "metric-1",
          content: { type: "metric", slug: "annualRunRate" },
          label: "Annual Run Rate",
          value: fc(g.currentRevenue * 12),
          description: "Based on current monthly",
          hasData: g.currentRevenue > 0,
          metricStyle: { icon: "TrendingUp", color: "violet", href: "/revenue" },
        },
        {
          slotId: "metric-2",
          content: { type: "metric", slug: "revenueStreams" },
          label: "Revenue Streams",
          value: String(revenueDetails.streamCount),
          description: "Active sources",
          hasData: true,
          metricStyle: { icon: "BarChart3", color: "blue", href: "/revenue" },
        },
        {
          slotId: "metric-3",
          content: { type: "metric", slug: "growth" },
          label: "Growth",
          value: `${g.revenueGrowthPercent > 0 ? "+" : ""}${g.revenueGrowthPercent.toFixed(1)}%`,
          description: g.doublingTimeMonths ? `Doubles in ${Math.ceil(g.doublingTimeMonths)}mo` : "vs last month",
          hasData: true,
          metricStyle: { icon: "TrendingUp", color: "teal", href: "/revenue" },
        },
      ];

  const resolvedSlotData = [...pageDefaultSlots, ...allEngineSlots];

  return (
    <div>
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-surface-900">Revenue</h1>
          <p className="mt-1 text-sm text-surface-500">
            Your growth story &mdash; MRR, streams, waterfall, and AI projections
          </p>
        </div>
        <AddRevenueStreamForm scenarioId={scenarioId} />
      </div>

      <RevenueView
        revenueDetails={revenueDetails}
        resolvedSlotData={resolvedSlotData}
        revenueTimeline={revenueTimeline}
        mrrTimeline={mrrTimeline}
        scenarioId={scenarioId}
      />
    </div>
  );
}
