export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import { getCompany, getActiveScenario, getServerScenarioId, getFundingRounds } from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { monthKey, METRIC_REGISTRY } from "@burnless/engine";
import type { ResolvedSlotData } from "@burnless/engine";
import { buildSlotMetricCard } from "@/lib/build-slot-metrics";
import { formatCurrency } from "@burnless/types";
import { FundingView } from "./funding-view";
import { AddFundingForm } from "./add-funding-form";
import { SetupPrompt } from "@/components/ui/empty-state";
import { ReportContentSkeleton } from "@/components/reports/report-skeleton";

export default async function FundingPage() {
  const scenarioId = await getServerScenarioId();
  const company = await getCompany();
  if (!company) return <SetupPrompt context="tracking funding" />;

  return (
    <Suspense fallback={<ReportContentSkeleton />}>
      <FundingContent companyId={company.id} scenarioId={scenarioId} />
    </Suspense>
  );
}

async function FundingContent({ companyId, scenarioId: paramScenarioId }: { companyId: string; scenarioId?: string }) {
  const scenario = await getActiveScenario(companyId, paramScenarioId);
  const [fundingRounds, data] = await Promise.all([
    getFundingRounds(companyId),
    scenario ? computeDashboardData(companyId, scenario.id) : null,
  ]);

  const currentMonth = data?.currentMonth ?? monthKey(new Date());
  const currentCash = data ? (data.metrics.cashPosition.find((m) => m.month === currentMonth)?.value ?? data.startingCash) : 0;
  const currentBurn = data ? (data.metrics.netBurnRate.find((m) => m.month === currentMonth)?.value ?? 0) : 0;
  const currentRunway = data ? (data.metrics.cashRunwayMonths.find((m) => m.month === currentMonth)?.value ?? 0) : 0;

  const totalRaised = fundingRounds
    .filter((r) => !r.isProjected)
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const completedRounds = fundingRounds.filter((r) => !r.isProjected);

  // Compute dilution for cap table
  const totalDilution = fundingRounds
    .filter((r) => !r.isProjected)
    .reduce((sum, r) => sum + Number(r.dilutionPercent ?? 0), 0);
  const foundersOwnership = Math.max(0, 100 - totalDilution);

  const roundsForDisplay = fundingRounds.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    amount: Number(r.amount),
    date: r.date ? (typeof r.date === "string" ? r.date : new Date(r.date).toISOString()) : new Date().toISOString(),
    preMoneyValuation: r.preMoneyValuation ? Number(r.preMoneyValuation) : null,
    dilutionPercent: r.dilutionPercent ? Number(r.dilutionPercent) : null,
    isProjected: r.isProjected,
  }));

  const now = new Date();
  const prevMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const fc = (v: number) => formatCurrency(v, "USD", undefined, { compact: true });

  const spark = (series: { month: string; value: number }[]) => {
    const vals = series.slice(-8).map(t => t.value);
    return vals.length >= 2 ? vals : undefined;
  };

  // Build resolved slot data for ALL engine metrics (swap targets)
  const allEngineSlots: ResolvedSlotData[] = data
    ? METRIC_REGISTRY.map((def) =>
        buildSlotMetricCard(def.slug, data.metrics, currentMonth, prevMonth)
      )
    : [];

  // Build page-specific default cards as ResolvedSlotData
  const pageDefaultSlots: ResolvedSlotData[] = [
    {
      slotId: "metric-0",
      content: { type: "metric", slug: "totalRaised" },
      label: "Total Raised",
      value: totalRaised > 0 ? fc(totalRaised) : "$---",
      description: totalRaised > 0 ? `${completedRounds.length} round${completedRounds.length !== 1 ? "s" : ""} completed` : "Add a funding round",
      hasData: totalRaised > 0,
      metricStyle: { icon: "Banknote", color: "emerald", href: "/funding" },
    },
    {
      slotId: "metric-1",
      content: { type: "metric", slug: "currentCash" },
      label: "Current Cash",
      value: currentCash > 0 ? fc(currentCash) : "$---",
      description: currentCash > 0 ? "Available capital" : "Add funding to see cash",
      hasData: currentCash > 0,
      sparkData: data ? spark(data.metrics.cashPosition) : undefined,
      metricStyle: { icon: "Wallet", color: "emerald", href: "/funding" },
    },
    {
      slotId: "metric-2",
      content: { type: "metric", slug: "runway" },
      label: "Runway",
      value: currentBurn > 0 && currentCash > 0 ? (currentRunway >= 999 ? "\u221e" : `${Math.round(currentRunway)} months`) : "-- mo",
      description: currentBurn > 0 && currentCash > 0 ? `At ${fc(currentBurn)}/mo burn` : "Add funding & expenses",
      hasData: currentBurn > 0 && currentCash > 0,
      sparkData: data ? spark(data.metrics.cashRunwayMonths) : undefined,
      metricStyle: { icon: "Clock", color: "blue", href: "/reports/runway" },
    },
    {
      slotId: "metric-3",
      content: { type: "metric", slug: "founderOwnership" },
      label: "Founder Ownership",
      value: completedRounds.length > 0 ? `${foundersOwnership.toFixed(0)}%` : "--%",
      description: completedRounds.length > 0 ? `After ${totalDilution.toFixed(0)}% dilution` : "Add a funding round",
      hasData: completedRounds.length > 0,
      metricStyle: { icon: "PieChart", color: "violet", href: "/funding" },
    },
  ];

  const resolvedSlotData = [...pageDefaultSlots, ...allEngineSlots];

  return (
    <div>
      <div className="mb-6 sm:mb-12 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-surface-900">Funding</h1>
          <p className="mt-1 text-sm text-surface-500">
            Capital sources, fundraising history, and cap table
          </p>
        </div>
        <AddFundingForm />
      </div>

      <FundingView
        totalRaised={totalRaised}
        completedRoundsCount={completedRounds.length}
        currentCash={currentCash}
        currentBurn={currentBurn}
        currentRunway={currentRunway}
        foundersOwnership={foundersOwnership}
        totalDilution={totalDilution}
        rounds={roundsForDisplay}
        resolvedSlotData={resolvedSlotData}
      />
    </div>
  );
}
