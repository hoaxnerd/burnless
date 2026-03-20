import { getCompany, getActiveScenario, getHeadcountPlans, getDepartments } from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { monthKey } from "@burnless/engine";
import { TeamDetails } from "./team-details";
import { AddHireForm } from "./add-hire-form";

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ scenarioId?: string }>;
}) {
  const params = await searchParams;
  const company = await getCompany();
  const scenario = company ? await getActiveScenario(company.id, params.scenarioId) : null;
  const plans = scenario ? await getHeadcountPlans(scenario.id) : [];
  const departments = company ? await getDepartments(company.id) : [];
  const data = company && scenario ? await computeDashboardData(company.id, scenario.id) : null;

  const deptMap = new Map(departments.map((d) => [d.id, d.name]));

  const now = new Date();
  const currentMonth = monthKey(new Date(now.getFullYear(), now.getMonth(), 1));

  // Split into current team and planned hires
  const currentTeam = plans.filter((p) => p.startDate <= now);
  const plannedHires = plans.filter((p) => p.startDate > now);

  const totalHeadcount = currentTeam.reduce((sum, p) => sum + p.count, 0);
  const totalMonthlyCost = currentTeam.reduce(
    (sum, p) => sum + (Number(p.salary) * p.count * (1 + Number(p.benefitsRate))) / 12,
    0
  );

  const totalBurn = data ? (data.metrics.netBurnRate.find((m) => m.month === currentMonth)?.value ?? 0) : 0;
  const costPercentOfBurn = totalBurn > 0 ? (totalMonthlyCost / totalBurn * 100) : 0;
  const revPerEmployee = data ? (data.metrics.revenuePerEmployee.find((m) => m.month === currentMonth)?.value ?? 0) : 0;

  // Group by department
  const deptGroups = new Map<string, typeof plans>();
  for (const plan of currentTeam) {
    const deptName = deptMap.get(plan.departmentId) ?? "Other";
    if (!deptGroups.has(deptName)) deptGroups.set(deptName, []);
    deptGroups.get(deptName)!.push(plan);
  }

  const departmentBreakdown = Array.from(deptGroups.entries()).map(([dept, members]) => ({
    department: dept,
    headcount: members.reduce((sum, m) => sum + m.count, 0),
    monthlyCost: members.reduce(
      (sum, m) => sum + (Number(m.salary) * m.count * (1 + Number(m.benefitsRate))) / 12,
      0
    ),
    members: members.map((m) => ({
      id: m.id,
      title: m.title,
      count: m.count,
      salary: Number(m.salary),
      benefitsRate: Number(m.benefitsRate),
      startDate: m.startDate.toISOString(),
    })),
  }));

  const plannedHiresData = plannedHires.map((h) => ({
    id: h.id,
    title: h.title,
    department: deptMap.get(h.departmentId) ?? "Other",
    salary: Number(h.salary),
    benefitsRate: Number(h.benefitsRate),
    startDate: h.startDate.toISOString(),
    count: h.count,
  }));

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Team</h1>
          <p className="mt-1 text-sm text-surface-500">
            Headcount planning, costs, and hiring timeline
            {scenario && <span className="ml-2 text-surface-400">&mdash; {scenario.name}</span>}
          </p>
        </div>
        {scenario && (
          <AddHireForm
            scenarioId={scenario.id}
            departments={departments.map((d) => ({ id: d.id, name: d.name }))}
          />
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
          <p className="text-sm font-medium text-surface-500">Total Headcount</p>
          <p className="mt-2 text-3xl font-bold text-surface-900">{totalHeadcount}</p>
          {plannedHires.length > 0 && (
            <p className="mt-1 text-xs text-surface-400">+{plannedHires.reduce((s, h) => s + h.count, 0)} planned</p>
          )}
        </div>
        <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
          <p className="text-sm font-medium text-surface-500">Monthly People Cost</p>
          <p className="mt-2 text-3xl font-bold text-surface-900">{formatCurrency(totalMonthlyCost)}</p>
          <p className="mt-1 text-xs text-surface-400">
            {costPercentOfBurn > 0 ? `${costPercentOfBurn.toFixed(0)}% of total burn` : "Incl. salary + benefits"}
          </p>
        </div>
        <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
          <p className="text-sm font-medium text-surface-500">Revenue / Employee</p>
          <p className="mt-2 text-3xl font-bold text-surface-900">{formatCurrency(revPerEmployee)}<span className="text-base font-normal text-surface-400">/mo</span></p>
          <p className="mt-1 text-xs text-surface-400">Efficiency metric</p>
        </div>
        <div className="rounded-xl bg-surface-0 border border-surface-200 p-6">
          <p className="text-sm font-medium text-surface-500">Departments</p>
          <p className="mt-2 text-3xl font-bold text-surface-900">{deptGroups.size}</p>
          <p className="mt-1 text-xs text-surface-400">{departments.length} total defined</p>
        </div>
      </div>

      {/* Team details */}
      <TeamDetails
        departmentBreakdown={departmentBreakdown}
        plannedHires={plannedHiresData}
        totalMonthlyCost={totalMonthlyCost}
      />
    </div>
  );
}
