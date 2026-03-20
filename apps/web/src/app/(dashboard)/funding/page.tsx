import { getCompany, getDefaultScenario, getFundingRounds } from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { monthKey } from "@burnless/engine";
import { FundingDetails } from "./funding-details";

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

export default async function FundingPage() {
  const company = await getCompany();
  if (!company) {
    return (
      <div className="rounded-xl bg-surface-0 border border-surface-200 p-12 text-center">
        <h3 className="text-lg font-semibold text-surface-900 mb-2">Set up your company first</h3>
        <p className="text-sm text-surface-500">Complete onboarding to track funding.</p>
      </div>
    );
  }

  const scenario = await getDefaultScenario(company.id);
  const [fundingRounds, data] = await Promise.all([
    getFundingRounds(company.id),
    scenario ? computeDashboardData(company.id, scenario.id) : null,
  ]);

  const currentMonth = data?.currentMonth ?? monthKey(new Date());
  const currentCash = data ? (data.metrics.cashPosition.find((m) => m.month === currentMonth)?.value ?? data.startingCash) : 0;
  const currentBurn = data ? (data.metrics.netBurnRate.find((m) => m.month === currentMonth)?.value ?? 0) : 0;
  const currentRunway = data ? (data.metrics.cashRunwayMonths.find((m) => m.month === currentMonth)?.value ?? 0) : 0;

  const totalRaised = fundingRounds
    .filter((r) => !r.isProjected)
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const projectedRounds = fundingRounds.filter((r) => r.isProjected);
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
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Funding</h1>
          <p className="mt-1 text-sm text-surface-500">
            Capital sources, fundraising history, and cap table
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
          <p className="text-sm font-medium text-surface-500">Total Raised</p>
          <p className="mt-2 text-3xl font-bold text-surface-900">{formatCurrency(totalRaised)}</p>
          <p className="mt-1 text-xs text-surface-400">{completedRounds.length} round{completedRounds.length !== 1 ? "s" : ""} completed</p>
        </div>
        <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
          <p className="text-sm font-medium text-surface-500">Current Cash</p>
          <p className="mt-2 text-3xl font-bold text-surface-900">{formatCurrency(currentCash)}</p>
          <p className="mt-1 text-xs text-surface-400">Available capital</p>
        </div>
        <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
          <p className="text-sm font-medium text-surface-500">Runway</p>
          <p className="mt-2 text-3xl font-bold text-surface-900">
            {currentRunway >= 999 ? "\u221e" : `${Math.round(currentRunway)} months`}
          </p>
          <p className="mt-1 text-xs text-surface-400">At {formatCurrency(currentBurn)}/mo burn</p>
        </div>
        <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
          <p className="text-sm font-medium text-surface-500">Founder Ownership</p>
          <p className="mt-2 text-3xl font-bold text-surface-900">{foundersOwnership.toFixed(0)}%</p>
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
