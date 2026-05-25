export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import Link from "next/link";
import { getCompany, getDefaultScenario } from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { monthKey, METRIC_REGISTRY } from "@burnless/engine";
import type { ResolvedSlotData } from "@burnless/engine";
import { buildSlotMetricCard } from "@/lib/build-slot-metrics";
import { formatCurrency } from "@burnless/types";
import { companyCurrency } from "@/lib/server-currency";
import { SetupPrompt, ScenarioPrompt } from "@/components/ui/empty-state";
import { ReportContentSkeleton } from "@/components/reports/report-skeleton";
import { RunwayView } from "./runway-view";

export default async function RunwayPage() {
  const company = await getCompany();
  if (!company) return <SetupPrompt context="viewing reports" />;
  const scenario = await getDefaultScenario(company.id);
  if (!scenario) return <ScenarioPrompt context="generate a Runway analysis" />;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Link href="/reports" className="text-sm text-surface-400 hover:text-surface-600">Reports</Link>
        <span className="text-surface-300">/</span>
      </div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-surface-900">Runway Analysis</h1>
        <p className="mt-1 text-sm text-surface-500">
          {company.name} &mdash; {scenario.name} scenario
        </p>
      </div>
      <Suspense fallback={<ReportContentSkeleton />}>
        <RunwayContent companyId={company.id} scenarioId={scenario.id} companyName={company.name} scenarioName={scenario.name} currency={companyCurrency(company)} />
      </Suspense>
    </div>
  );
}

async function RunwayContent({ companyId, scenarioId, companyName, scenarioName, currency }: { companyId: string; scenarioId: string; companyName: string; scenarioName: string; currency: ReturnType<typeof companyCurrency> }) {
  const data = await computeDashboardData(companyId, scenarioId);

  const { currentMonth } = data;
  const now = new Date();
  const prevMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const fc = (v: number) => formatCurrency(v, currency, undefined, { compact: true });

  const spark = (series: { month: string; value: number }[]) => {
    const vals = series.slice(-8).map(t => t.value);
    return vals.length >= 2 ? vals : undefined;
  };

  const latest = data.metrics.cashPosition[data.metrics.cashPosition.length - 1];
  const latestBurn = data.metrics.netBurnRate[data.metrics.netBurnRate.length - 1];
  const latestRunway = data.metrics.cashRunwayMonths[data.metrics.cashRunwayMonths.length - 1];
  const zeroCashMonth = data.metrics.cashPosition.find((c) => c.value <= 0);

  // Build resolved slot data for ALL engine metrics (swap targets)
  const allEngineSlots: ResolvedSlotData[] = METRIC_REGISTRY.map((def) =>
    buildSlotMetricCard(def.slug, data.metrics, currentMonth, prevMonth)
  );

  // Build page-specific default cards as ResolvedSlotData
  const pageDefaultSlots: ResolvedSlotData[] = [
    {
      slotId: "metric-0",
      content: { type: "metric", slug: "startingCash" },
      label: "Starting Cash",
      value: fc(data.startingCash),
      hasData: data.startingCash > 0,
      metricStyle: { icon: "DollarSign", color: "emerald", href: "/reports/runway" },
    },
    {
      slotId: "metric-1",
      content: { type: "metric", slug: "currentCash" },
      label: "Current Cash",
      value: fc(latest?.value ?? 0),
      hasData: (latest?.value ?? 0) > 0,
      sparkData: spark(data.metrics.cashPosition),
      metricStyle: { icon: "DollarSign", color: "blue", href: "/reports/runway" },
    },
    {
      slotId: "metric-2",
      content: { type: "metric", slug: "netBurnRate" },
      label: "Net Burn Rate",
      value: fc(latestBurn?.value ?? 0),
      description: "Latest month",
      hasData: (latestBurn?.value ?? 0) > 0,
      sparkData: spark(data.metrics.netBurnRate),
      metricStyle: { icon: "TrendingDown", color: "orange", href: "/reports/runway" },
    },
    {
      slotId: "metric-3",
      content: { type: "metric", slug: "runway" },
      label: "Runway",
      value: latestRunway && latestRunway.value < 999 ? `${Math.round(latestRunway.value)} months` : "\u221e",
      description: zeroCashMonth ? `Cash runs out ~${zeroCashMonth.month}` : "Sufficient runway",
      hasData: (latestRunway?.value ?? 0) > 0,
      sparkData: spark(data.metrics.cashRunwayMonths),
      metricStyle: { icon: "Clock", color: "violet", href: "/reports/runway" },
    },
  ];

  const resolvedSlotData = [...pageDefaultSlots, ...allEngineSlots];

  return (
    <RunwayView
      cashPosition={data.metrics.cashPosition}
      netBurnRate={data.metrics.netBurnRate}
      runway={data.metrics.cashRunwayMonths}
      grossBurnRate={data.metrics.burnRate}
      startingCash={data.startingCash}
      companyName={companyName}
      scenarioName={scenarioName}
      resolvedSlotData={resolvedSlotData}
    />
  );
}
