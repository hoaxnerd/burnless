import { getCompany, getScenarios } from "@/lib/data";
import { ComparisonView } from "./comparison-view";

export default async function ScenarioComparePage({
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
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-surface-900">
          Compare Scenarios
        </h1>
        <p className="mt-1 text-sm text-surface-500">
          Side-by-side analysis of different financial scenarios
        </p>
      </div>

      <ComparisonView
        scenarios={scenarioOptions}
        initialIds={selectedIds}
      />
    </div>
  );
}
