import Link from "next/link";
import { getCompany, getDefaultScenario, getHeadcountPlans, getDepartments } from "@/lib/data";

export default async function TeamPage() {
  const company = await getCompany();
  const scenario = company ? await getDefaultScenario(company.id) : null;
  const plans = scenario ? await getHeadcountPlans(scenario.id) : [];
  const departments = company ? await getDepartments(company.id) : [];

  const deptMap = new Map(departments.map((d) => [d.id, d.name]));

  const totalHeadcount = plans.reduce((sum, p) => sum + p.count, 0);
  const totalAnnualCost = plans.reduce(
    (sum, p) => sum + Number(p.salary) * p.count * (1 + Number(p.benefitsRate)),
    0
  );

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Team & Headcount</h1>
          <p className="mt-1 text-sm text-surface-500">
            Plan and track your team growth
            {scenario && <span className="ml-2 text-surface-400">&mdash; {scenario.name}</span>}
          </p>
        </div>
      </div>

      {plans.length === 0 ? (
        <div className="rounded-xl bg-surface-0 border border-surface-200 p-12 text-center">
          <div className="mx-auto max-w-md">
            <div className="text-4xl mb-4">👥</div>
            <h3 className="text-lg font-semibold text-surface-900 mb-2">No team members yet</h3>
            <p className="text-sm text-surface-500 mb-6">
              Add your current team and planned hires to see how headcount affects your burn rate and runway.
            </p>
            <p className="text-xs text-surface-400">
              Use the API: <code className="text-brand-600">POST /api/headcount</code>
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
              <p className="text-sm font-medium text-surface-500">Total Headcount</p>
              <p className="mt-2 text-3xl font-bold text-surface-900">{totalHeadcount}</p>
            </div>
            <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
              <p className="text-sm font-medium text-surface-500">Annual Personnel Cost</p>
              <p className="mt-2 text-3xl font-bold text-surface-900">
                ${(totalAnnualCost / 1000).toFixed(0)}k
              </p>
            </div>
            <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
              <p className="text-sm font-medium text-surface-500">Monthly Burn (People)</p>
              <p className="mt-2 text-3xl font-bold text-surface-900">
                ${(totalAnnualCost / 12 / 1000).toFixed(0)}k
              </p>
            </div>
          </div>

          {/* Headcount table */}
          <div className="rounded-xl bg-surface-0 border border-surface-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  <th className="text-left px-6 py-3 text-xs font-medium text-surface-500 uppercase">Role</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-surface-500 uppercase">Department</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-surface-500 uppercase">Count</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-surface-500 uppercase">Salary</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-surface-500 uppercase">Total Cost</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-surface-500 uppercase">Start</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => {
                  const totalCost = Number(plan.salary) * plan.count * (1 + Number(plan.benefitsRate));
                  return (
                    <tr key={plan.id} className="border-b border-surface-100 hover:bg-surface-50">
                      <td className="px-6 py-4 text-sm font-medium text-surface-900">{plan.title}</td>
                      <td className="px-6 py-4 text-sm text-surface-600">{deptMap.get(plan.departmentId) ?? "—"}</td>
                      <td className="px-6 py-4 text-sm text-surface-600 text-right">{plan.count}</td>
                      <td className="px-6 py-4 text-sm text-surface-600 text-right">${(Number(plan.salary) / 1000).toFixed(0)}k</td>
                      <td className="px-6 py-4 text-sm font-medium text-surface-900 text-right">${(totalCost / 1000).toFixed(0)}k</td>
                      <td className="px-6 py-4 text-sm text-surface-500">{plan.startDate.toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
