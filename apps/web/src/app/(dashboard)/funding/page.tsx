import { Suspense } from "react";
import { getCompany, getActiveScenario, getFundingRounds } from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { monthKey } from "@burnless/engine";
import { FundingDetails } from "./funding-details";
import { AddFundingForm } from "./add-funding-form";
import { SetupPrompt } from "@/components/ui/empty-state";
import { ReportContentSkeleton } from "@/components/reports/report-skeleton";

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

export default async function FundingPage({
  searchParams,
}: {
  searchParams: Promise<{ scenarioId?: string }>;
}) {
  const params = await searchParams;
  const company = await getCompany();
  if (!company) return <SetupPrompt context="tracking funding" />;

  return (
    <Suspense fallback={<ReportContentSkeleton />}>
      <FundingContent companyId={company.id} scenarioId={params.scenarioId} />
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
    date: r.date.toISOString(),
    preMoneyValuation: r.preMoneyValuation ? Number(r.preMoneyValuation) : null,
    dilutionPercent: r.dilutionPercent ? Number(r.dilutionPercent) : null,
    isProjected: r.isProjected,
  }));

  return (
    <div>
      <div className="mb-8 sm:mb-12 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-surface-900">Funding</h1>
          <p className="mt-1 text-sm text-surface-500">
            Capital sources, fundraising history, and cap table
          </p>
        </div>
        <AddFundingForm />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 sm:mb-10">
        <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6">
          <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">Total Raised</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-surface-900">{formatCurrency(totalRaised)}</p>
          <p className="mt-1 text-xs text-surface-400">{completedRounds.length} round{completedRounds.length !== 1 ? "s" : ""} completed</p>
        </div>
        <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6">
          <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">Current Cash</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-surface-900">{formatCurrency(currentCash)}</p>
          <p className="mt-1 text-xs text-surface-400">Available capital</p>
        </div>
        <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6">
          <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">Runway</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-surface-900">
            {currentRunway >= 999 ? "\u221e" : `${Math.round(currentRunway)} months`}
          </p>
          <p className="mt-1 text-xs text-surface-400">At {formatCurrency(currentBurn)}/mo burn</p>
        </div>
        <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6">
          <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">Founder Ownership</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-surface-900">{foundersOwnership.toFixed(0)}%</p>
          <p className="mt-1 text-xs text-surface-400">After {totalDilution.toFixed(0)}% dilution</p>
        </div>
      </div>

      {/* Funding details */}
      <FundingDetails
        rounds={roundsForDisplay}
        foundersOwnership={foundersOwnership}
        currentCash={currentCash}
        currentBurn={currentBurn}
        currentRunway={currentRunway}
      />
    </div>
  );
}
