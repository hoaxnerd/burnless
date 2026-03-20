import Link from "next/link";
import { getCompany, getDefaultScenario } from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { ProfitLossView } from "./profit-loss-view";

export default async function ProfitLossPage() {
  const company = await getCompany();
  if (!company) return <p>Set up your company first.</p>;
  const scenario = await getDefaultScenario(company.id);
  if (!scenario) return <p>Create a scenario first.</p>;

  const data = await computeDashboardData(company.id, scenario.id);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Link href="/reports" className="text-sm text-surface-400 hover:text-surface-600">Reports</Link>
        <span className="text-surface-300">/</span>
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-surface-900">Profit & Loss</h1>
        <p className="mt-1 text-sm text-surface-500">
          {company.name} &mdash; {scenario.name} scenario
        </p>
      </div>
      <ProfitLossView profitAndLoss={data.profitAndLoss} />
    </div>
  );
}
