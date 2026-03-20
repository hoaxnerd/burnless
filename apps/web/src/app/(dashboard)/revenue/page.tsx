import { getCompany, getActiveScenario } from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { computeRevenueDetails } from "@/lib/compute-revenue";
import { seriesToArray } from "@burnless/engine";
import { RevenueView } from "./revenue-view";
import { AddRevenueStreamForm } from "./add-revenue-stream-form";
import { SetupPrompt, ScenarioPrompt } from "@/components/ui/empty-state";

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

  const [data, revenueDetails] = await Promise.all([
    computeDashboardData(company.id, scenario.id),
    computeRevenueDetails(company.id, scenario.id),
  ]);

  const revenueTimeline = seriesToArray(data.totalRevenue);
  const mrrTimeline = data.metrics.mrr;

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Revenue</h1>
          <p className="mt-1 text-sm text-surface-500">
            Your growth story &mdash; MRR, streams, waterfall, and AI projections
          </p>
        </div>
        <AddRevenueStreamForm scenarioId={scenario.id} />
      </div>

      <RevenueView
        revenueDetails={revenueDetails}
        revenueTimeline={revenueTimeline}
        mrrTimeline={mrrTimeline}
      />
    </div>
  );
}
