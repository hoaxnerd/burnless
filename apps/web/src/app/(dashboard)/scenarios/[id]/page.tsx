export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import { getScenarioById, getCompany, getForecastLines, getRevenueStreams, getHeadcountPlans, getFundingRounds } from "@/lib/data";
import { notFound } from "next/navigation";
import { ScenarioBuilder } from "./scenario-builder";

export default async function ScenarioDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = await getCompany();
  if (!company) notFound();

  const scenario = await getScenarioById(id);
  if (!scenario || scenario.companyId !== company.id) notFound();

  return (
    <Suspense fallback={
      <div className="space-y-6 animate-pulse">
        <div className="h-10 w-64 bg-surface-100 rounded" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 h-96 bg-surface-50 rounded-2xl" />
          <div className="lg:col-span-2 h-96 bg-surface-50 rounded-2xl" />
        </div>
      </div>
    }>
      <ScenarioContent scenarioId={id} companyId={company.id} scenario={scenario} />
    </Suspense>
  );
}

async function ScenarioContent({
  scenarioId,
  companyId,
  scenario,
}: {
  scenarioId: string;
  companyId: string;
  scenario: { id: string; name: string; type: string; description: string | null; isDefault: boolean; isBudget: boolean };
}) {
  const [forecastLines, revenueStreams, headcountPlans, fundingRounds] =
    await Promise.all([
      getForecastLines(scenarioId),
      getRevenueStreams(scenarioId),
      getHeadcountPlans(scenarioId),
      getFundingRounds(companyId),
    ]);

  return (
    <ScenarioBuilder
      scenario={{
        id: scenario.id,
        name: scenario.name,
        type: scenario.type,
        description: scenario.description,
        isDefault: scenario.isDefault,
        isBudget: scenario.isBudget,
      }}
      forecastLineCount={forecastLines.length}
      revenueStreamCount={revenueStreams.length}
      headcountPlanCount={headcountPlans.length}
      totalFunding={fundingRounds.reduce(
        (sum, r) => sum + Number(r.amount),
        0,
      )}
    />
  );
}
