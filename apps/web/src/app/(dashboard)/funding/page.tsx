export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import { getCompany, getActiveScenario, getServerScenarioId, getFundingRounds } from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { monthKey, previousMonthKey, METRIC_REGISTRY, dSum } from "@burnless/engine";
import type { ResolvedSlotData } from "@burnless/engine";
import { buildSlotMetricCard } from "@/lib/build-slot-metrics";
import { computeCapTableForCompany } from "@/lib/compute-cap-table";
import { deriveFounderOwnershipFromCapTable } from "@/lib/compute-funding-page";
import { formatCurrency, formatPercent } from "@burnless/types";
import { companyCurrency } from "@/lib/server-currency";
import Link from "next/link";
import { PieChart } from "lucide-react";
import { FundingView } from "./funding-view";
import { AddFundingButton } from "./add-funding-button";
import { SetupPrompt } from "@/components/ui/empty-state";
import { ReportContentSkeleton } from "@/components/reports/report-skeleton";

export default async function FundingPage() {
  const scenarioId = await getServerScenarioId();
  const company = await getCompany();
  if (!company) return <SetupPrompt context="tracking funding" />;

  return (
    <Suspense fallback={<ReportContentSkeleton />}>
      <FundingContent companyId={company.id} scenarioId={scenarioId} currency={companyCurrency(company)} />
    </Suspense>
  );
}

async function FundingContent({ companyId, scenarioId: paramScenarioId, currency }: { companyId: string; scenarioId?: string; currency: ReturnType<typeof companyCurrency> }) {
  const scenario = await getActiveScenario(companyId, paramScenarioId);
  const activeScenarioId = paramScenarioId ?? null;
  const [fundingRounds, data, capTable] = await Promise.all([
    getFundingRounds(companyId, activeScenarioId),
    scenario ? computeDashboardData(companyId, activeScenarioId) : null,
    // H3 (Task 2.7): single source for founder ownership — the SAME reconciled
    // engine cap table the /funding/cap-table page renders. Scenario-aware.
    computeCapTableForCompany(companyId, activeScenarioId),
  ]);

  const currentMonth = data?.currentMonth ?? monthKey(new Date());
  const currentCash = data ? (data.metrics.cashPosition.find((m) => m.month === currentMonth)?.value ?? data.startingCash) : 0;
  const currentGrossBurn = data ? (data.metrics.burnRate.find((m) => m.month === currentMonth)?.value ?? 0) : 0;
  const currentRunway = data ? (data.metrics.cashRunwayMonths.find((m) => m.month === currentMonth)?.value ?? 0) : 0;

  const completedRounds = fundingRounds.filter((r) => !r.isProjected);
  const totalRaised = dSum(completedRounds.map((r) => Number(r.amount)));

  // H3 (Task 2.7): founder ownership reads the reconciled engine cap table — the
  // single source the /funding/cap-table page renders — so the two surfaces can
  // never show contradictory founder %s. The legacy Σ dilutionPercent model
  // (hand-entered per-round deltas) is no longer the headline source.
  const foundersOwnership = deriveFounderOwnershipFromCapTable(capTable);
  const totalDilution = Math.max(0, 100 - foundersOwnership);
  // No share classes / option pools → empty cap table. Founder ownership then
  // derives to 0, which must NOT be shown as a confident "0.0%"; the Ownership
  // card + chart branch on this to render a set-up state instead.
  const hasCapTableData = !capTable.isEmpty;

  const roundsForDisplay = fundingRounds.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    amount: Number(r.amount),
    date: r.date ? (typeof r.date === "string" ? r.date : new Date(r.date).toISOString()) : new Date().toISOString(),
    preMoneyValuation: r.preMoneyValuation ? Number(r.preMoneyValuation) : null,
    dilutionPercent: r.dilutionPercent ? Number(r.dilutionPercent) : null,
    isProjected: r.isProjected,
    // FUND-07: grant milestones drive the MilestoneTracker in the round-detail
    // panel. Non-grant rounds have none.
    milestones: ((r.parameters as { milestones?: unknown } | null)?.milestones ?? []) as Array<{
      id: string;
      label: string;
      amount: number;
      dueDate: string;
      hitDate?: string;
      matchWarning?: { requiredAmount: number; actualAmount: number; asOf: string };
    }>,
  }));

  const prevMonth = data?.prevMonth ?? previousMonthKey(currentMonth);
  const fc = (v: number) => formatCurrency(v, currency, undefined, { compact: true });

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
      // Mirror the dashboard runway exactly (same engine value). \u221e shows when the
      // engine derives unbounded runway \u2014 a genuinely profitable month where gross
      // burn is covered by revenue \u2014 rather than being suppressed to "-- mo".
      value: currentCash > 0 ? (currentRunway >= 999 ? "\u221e" : `${Math.round(currentRunway)} months`) : "-- mo",
      description: currentCash > 0 ? (currentRunway >= 999 ? "Revenue covers burn" : `At ${fc(currentGrossBurn)}/mo gross burn`) : "Add funding & expenses",
      hasData: currentCash > 0,
      sparkData: data ? spark(data.metrics.cashRunwayMonths) : undefined,
      metricStyle: { icon: "Clock", color: "blue", href: "/reports/runway" },
    },
    {
      slotId: "metric-3",
      content: { type: "metric", slug: "founderOwnership" },
      label: "Founder Ownership",
      value: hasCapTableData ? formatPercent(foundersOwnership, undefined, 1) : "--%",
      description: hasCapTableData ? `After ${formatPercent(totalDilution, undefined, 1)} dilution` : "Add share classes & grants",
      hasData: hasCapTableData,
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
        <div className="flex items-center gap-3">
          {/* FUND-08: cap-table is always reachable from /funding (even when empty,
              where it lands on the FUND-05 empty-state). */}
          <Link
            href="/funding/cap-table"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-surface-600 hover:text-surface-900"
          >
            <PieChart className="h-4 w-4" />
            View cap table
          </Link>
          <AddFundingButton />
        </div>
      </div>

      <FundingView
        totalRaised={totalRaised}
        completedRoundsCount={completedRounds.length}
        currentCash={currentCash}
        currentBurn={currentGrossBurn}
        currentRunway={currentRunway}
        foundersOwnership={foundersOwnership}
        totalDilution={totalDilution}
        rounds={roundsForDisplay}
        resolvedSlotData={resolvedSlotData}
        currency={currency}
        hasCapTableData={hasCapTableData}
        capTableRows={capTable.rows.map((r) => ({ holder: r.holder, ownershipPercent: r.ownershipPercent }))}
      />
    </div>
  );
}
