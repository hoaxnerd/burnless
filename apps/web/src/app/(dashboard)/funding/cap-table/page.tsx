export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import { getCompany, getServerScenarioId } from "@/lib/data";
import { computeCapTableForCompany } from "@/lib/compute-cap-table";
import { SetupPrompt } from "@/components/ui/empty-state";
import { ReportContentSkeleton } from "@/components/reports/report-skeleton";
import { CapTableView } from "./cap-table-view";

export default async function CapTablePage() {
  const company = await getCompany();
  if (!company) return <SetupPrompt context="cap table" />;
  const scenarioId = await getServerScenarioId();

  return (
    <Suspense fallback={<ReportContentSkeleton />}>
      <CapTableContent companyId={company.id} scenarioId={scenarioId ?? null} />
    </Suspense>
  );
}

async function CapTableContent({
  companyId,
  scenarioId,
}: {
  companyId: string;
  scenarioId: string | null;
}) {
  const capTable = await computeCapTableForCompany(companyId, scenarioId);
  return <CapTableView capTable={capTable} />;
}
