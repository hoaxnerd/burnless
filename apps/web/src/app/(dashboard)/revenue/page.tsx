import { Suspense } from "react";
import { getCompany, getActiveScenario } from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { computeRevenueDetails } from "@/lib/compute-revenue";
import { seriesToArray } from "@burnless/engine";
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
        revenueTimeline={revenueTimeline}
        mrrTimeline={mrrTimeline}
        scenarioId={scenarioId}
      />
    </div>
  );
}
