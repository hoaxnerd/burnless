import { Suspense } from "react";
import { getCompany, getScenarios } from "@/lib/data";
import { ScenarioCards } from "./scenario-cards";
import { CreateScenarioDialog } from "./create-scenario-dialog";
import { ScenarioInsightsWrapper } from "./scenario-insights-wrapper";

async function ScenariosContent() {
  const company = await getCompany();
  const scenarioList = company ? await getScenarios(company.id) : [];

  const scenarioData = scenarioList.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    isDefault: s.isDefault,
    isBudget: s.isBudget,
    description: s.description,
    createdAt: s.createdAt.toISOString(),
  }));

  return (
    <>
      <ScenarioInsightsWrapper scenarios={scenarioData} />
      <ScenarioCards scenarios={scenarioData} />
    </>
  );
}

export default function ScenariosPage() {
  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Scenarios</h1>
          <p className="mt-1 text-sm text-surface-500">
            Model different futures for your business
          </p>
        </div>
        <CreateScenarioDialog />
      </div>

      <Suspense fallback={<ScenariosListSkeleton />}>
        <ScenariosContent />
      </Suspense>
    </div>
  );
}

function ScenariosListSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" role="status" aria-label="Loading scenarios">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((n) => (
          <div key={n} className="rounded-2xl bg-surface-0 border border-surface-200 p-6">
            <div className="h-5 w-32 bg-surface-100 rounded mb-3" />
            <div className="h-3 w-20 bg-surface-50 rounded mb-4" />
            <div className="h-3 w-full bg-surface-50 rounded" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading scenarios...</span>
    </div>
  );
}
