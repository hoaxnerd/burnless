export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import Link from "next/link";
import { getCompany, getDefaultScenario } from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { SetupPrompt, ScenarioPrompt } from "@/components/ui/empty-state";
import { ReportContentSkeleton } from "@/components/reports/report-skeleton";
import { ProfitLossView } from "./profit-loss-view";

export default async function ProfitLossPage() {
  const company = await getCompany();
  if (!company) return <SetupPrompt context="viewing reports" />;
  const scenario = await getDefaultScenario(company.id);
  if (!scenario) return <ScenarioPrompt context="generate a Profit & Loss report" />;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Link href="/reports" className="text-sm text-surface-400 hover:text-surface-600">Reports</Link>
        <span className="text-surface-300">/</span>
      </div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-surface-900">Profit & Loss</h1>
        <p className="mt-1 text-sm text-surface-500">
          {company.name} &mdash; {scenario.name} scenario
        </p>
      </div>
      <Suspense fallback={<ReportContentSkeleton />}>
        <ProfitLossContent companyId={company.id} scenarioId={scenario.id} companyName={company.name} scenarioName={scenario.name} />
      </Suspense>
    </div>
  );
}

async function ProfitLossContent({ companyId, scenarioId, companyName, scenarioName }: { companyId: string; scenarioId: string; companyName: string; scenarioName: string }) {
  const data = await computeDashboardData(companyId, scenarioId);
  return <ProfitLossView profitAndLoss={data.profitAndLoss} companyName={companyName} scenarioName={scenarioName} />;
}
