import { Suspense } from "react";
import { getCompany, getScenarios } from "@/lib/data";
import { ComparisonView } from "./comparison-view";

async function CompareContent({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const params = await searchParams;
  const company = await getCompany();
  const allScenarios = company ? await getScenarios(company.id) : [];

  const selectedIds = (params.ids ?? "").split(",").filter(Boolean);
  const scenarioOptions = allScenarios.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
  }));

  return (
    <ComparisonView
      scenarios={scenarioOptions}
      initialIds={selectedIds}
    />
  );
}

export default async function ScenarioComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-surface-900">
          Compare Scenarios
        </h1>
        <p className="mt-1 text-sm text-surface-500">
          Side-by-side analysis of different financial scenarios
        </p>
      </div>

      <Suspense fallback={<div className="text-sm text-surface-500">Loading comparison...</div>}>
        <CompareContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
