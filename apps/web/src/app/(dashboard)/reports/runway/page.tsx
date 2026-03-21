import Link from "next/link";
import { getCompany, getDefaultScenario } from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { SetupPrompt, ScenarioPrompt } from "@/components/ui/empty-state";
import { RunwayView } from "./runway-view";

export default async function RunwayPage() {
  const company = await getCompany();
  if (!company) return <SetupPrompt context="viewing reports" />;
  const scenario = await getDefaultScenario(company.id);
  if (!scenario) return <ScenarioPrompt context="generate a Runway analysis" />;

  const data = await computeDashboardData(company.id, scenario.id);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Link href="/reports" className="text-sm text-surface-400 hover:text-surface-600">Reports</Link>
        <span className="text-surface-300">/</span>
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-surface-900">Runway Analysis</h1>
        <p className="mt-1 text-sm text-surface-500">
          {company.name} &mdash; {scenario.name} scenario
        </p>
      </div>
      <RunwayView
        cashPosition={data.metrics.cashPosition}
        netBurnRate={data.metrics.netBurnRate}
        runway={data.metrics.cashRunwayMonths}
        grossBurnRate={data.metrics.burnRate}
        startingCash={data.startingCash}
        companyName={company.name}
        scenarioName={scenario.name}
      />
    </div>
  );
}
