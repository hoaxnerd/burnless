export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import Link from "next/link";
import { getCompany, getServerScenarioId } from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { SetupPrompt } from "@/components/ui/empty-state";
import { ReportContentSkeleton } from "@/components/reports/report-skeleton";
import { CashFlowView } from "./cash-flow-view";

export default async function CashFlowPage() {
  const company = await getCompany();
  if (!company) return <SetupPrompt context="viewing reports" />;
  const scenarioId = (await getServerScenarioId()) ?? null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Link href="/reports" className="text-sm text-surface-400 hover:text-surface-600">Reports</Link>
        <span className="text-surface-300">/</span>
      </div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-surface-900">Cash Flow Statement</h1>
        <p className="mt-1 text-sm text-surface-500">{company.name}</p>
      </div>
      <Suspense fallback={<ReportContentSkeleton />}>
        <CashFlowContent companyId={company.id} scenarioId={scenarioId} companyName={company.name} />
      </Suspense>
    </div>
  );
}

async function CashFlowContent({ companyId, scenarioId, companyName }: { companyId: string; scenarioId: string | null; companyName: string }) {
  const data = await computeDashboardData(companyId, scenarioId);
  return <CashFlowView cashFlow={data.cashFlow} startingCash={data.startingCash} companyName={companyName} />;
}
