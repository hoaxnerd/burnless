import { Suspense } from "react";
import { getCompany, getActiveScenario, getFundingRounds } from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { monthKey } from "@burnless/engine";
import { FundingView } from "./funding-view";
import { AddFundingForm } from "./add-funding-form";
import { SetupPrompt } from "@/components/ui/empty-state";
import { ReportContentSkeleton } from "@/components/reports/report-skeleton";

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
    date: r.date ? (typeof r.date === "string" ? r.date : r.date.toISOString()) : new Date().toISOString(),
    preMoneyValuation: r.preMoneyValuation ? Number(r.preMoneyValuation) : null,
    dilutionPercent: r.dilutionPercent ? Number(r.dilutionPercent) : null,
    isProjected: r.isProjected,
  }));

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
      />
    </div>
  );
}
