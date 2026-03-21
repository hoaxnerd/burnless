import Link from "next/link";
import { getCompany, getScenarios } from "@/lib/data";
import { SetupPrompt } from "@/components/ui/empty-state";
import { ScenarioCompareView } from "./scenario-compare-view";

export default async function ScenarioComparePage() {
  const company = await getCompany();
  if (!company) return <SetupPrompt context="comparing scenarios" />;
  const allScenarios = await getScenarios(company.id);

  if (allScenarios.length < 2) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Link href="/reports" className="text-sm text-surface-400 hover:text-surface-600">Reports</Link>
          <span className="text-surface-300">/</span>
        </div>
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-surface-900">Scenario Comparison</h1>
        </div>
        <div className="rounded-xl bg-surface-0 border border-surface-200 p-12 text-center">
          <h3 className="text-lg font-semibold text-surface-900 mb-2">Need at least 2 scenarios</h3>
          <p className="text-sm text-surface-500 mb-4">Create multiple scenarios to compare them side by side.</p>
          <Link href="/scenarios" className="text-sm text-brand-600 font-medium hover:underline">
            Go to Scenarios &rarr;
          </Link>
        </div>
      </div>
    );
  }

  const scenarioList = allScenarios.map((s) => ({ id: s.id, name: s.name, type: s.type }));

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Link href="/reports" className="text-sm text-surface-400 hover:text-surface-600">Reports</Link>
        <span className="text-surface-300">/</span>
      </div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-surface-900">Scenario Comparison</h1>
        <p className="mt-1 text-sm text-surface-500">{company.name}</p>
      </div>
      <ScenarioCompareView companyId={company.id} scenarios={scenarioList} />
    </div>
  );
}
