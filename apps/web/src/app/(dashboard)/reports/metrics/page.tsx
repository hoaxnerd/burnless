import { Suspense } from "react";
import Link from "next/link";
import { getCompany, getDefaultScenario } from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { SetupPrompt, ScenarioPrompt } from "@/components/ui/empty-state";
import { ReportContentSkeleton } from "@/components/reports/report-skeleton";
import { MetricsExplorer } from "./metrics-explorer";

export default async function MetricsPage() {
  const company = await getCompany();
  if (!company) return <SetupPrompt context="viewing reports" />;
  const scenario = await getDefaultScenario(company.id);
  if (!scenario) return <ScenarioPrompt context="explore metrics" />;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Link href="/reports" className="text-sm text-surface-400 hover:text-surface-600">Reports</Link>
        <span className="text-surface-300">/</span>
      </div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-surface-900">Metrics Explorer</h1>
        <p className="mt-1 text-sm text-surface-500">
          {company.name} &mdash; {scenario.name} &mdash; All 60+ financial and SaaS metrics
        </p>
      </div>
      <Suspense fallback={<ReportContentSkeleton />}>
        <MetricsContent companyId={company.id} scenarioId={scenario.id} />
      </Suspense>
    </div>
  );
}

async function MetricsContent({ companyId, scenarioId }: { companyId: string; scenarioId: string }) {
  const data = await computeDashboardData(companyId, scenarioId);
  return <MetricsExplorer metrics={data.metrics} currentMonth={data.currentMonth} />;
}
