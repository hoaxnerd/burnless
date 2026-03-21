import { getCompany, getScenarios } from "@/lib/data";
import { ScenarioCards } from "./scenario-cards";
import { CreateScenarioDialog } from "./create-scenario-dialog";
import { ScenarioInsightsWrapper } from "./scenario-insights-wrapper";

export default async function ScenariosPage() {
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

      <ScenarioInsightsWrapper scenarios={scenarioData} />

      <ScenarioCards scenarios={scenarioData} />
    </div>
  );
}
