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

  const [forecastLines, revenueStreams, headcountPlans, fundingRounds] =
    await Promise.all([
      getForecastLines(id),
      getRevenueStreams(id),
      getHeadcountPlans(id),
      getFundingRounds(company.id),
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
