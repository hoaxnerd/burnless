import { Suspense } from "react";
import { getCompany, getActiveScenario, getHeadcountPlans, getDepartments } from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { monthKey } from "@burnless/engine";
import { TeamView } from "./team-view";
import { AddHireForm } from "./add-hire-form";
import { ReportContentSkeleton } from "@/components/reports/report-skeleton";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ scenarioId?: string }>;
}) {
  const params = await searchParams;
  const company = await getCompany();
  const scenario = company ? await getActiveScenario(company.id, params.scenarioId) : null;

  return (
    <Suspense fallback={<ReportContentSkeleton />}>
      <TeamContent companyId={company?.id} scenarioId={scenario?.id} scenarioName={scenario?.name} />
    </Suspense>
  );
}

async function TeamContent({ companyId, scenarioId, scenarioName }: { companyId?: string; scenarioId?: string; scenarioName?: string }) {
  if (!companyId || !scenarioId) {
    return (
      <div className="rounded-xl bg-surface-0 border border-surface-200 p-12 text-center">
        <h3 className="text-lg font-semibold text-surface-900 mb-2">Set up your company first</h3>
        <p className="text-sm text-surface-500">Complete onboarding to start team planning.</p>
      </div>
    );
  }

  const [plans, departments, data] = await Promise.all([
    getHeadcountPlans(scenarioId),
    getDepartments(companyId),
    computeDashboardData(companyId, scenarioId),
  ]);

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

  const totalBurn = data.metrics.netBurnRate.find((m) => m.month === currentMonth)?.value ?? 0;
  const costPercentOfBurn = totalBurn > 0 ? (totalMonthlyCost / totalBurn * 100) : 0;
  const revPerEmployee = data.metrics.revenuePerEmployee.find((m) => m.month === currentMonth)?.value ?? 0;

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
      departmentId: m.departmentId,
      title: m.title,
      count: m.count,
      salary: Number(m.salary),
      benefitsRate: Number(m.benefitsRate),
      startDate: m.startDate.toISOString(),
      endDate: m.endDate ? m.endDate.toISOString() : null,
    })),
  }));

  const plannedHiresData = plannedHires.map((h) => ({
    id: h.id,
    departmentId: h.departmentId,
    title: h.title,
    department: deptMap.get(h.departmentId) ?? "Other",
    salary: Number(h.salary),
    benefitsRate: Number(h.benefitsRate),
    startDate: h.startDate.toISOString(),
    endDate: h.endDate ? h.endDate.toISOString() : null,
    count: h.count,
  }));

  return (
    <div>
      <div className="mb-6 sm:mb-12 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-surface-900">Team</h1>
          <p className="mt-1 text-sm text-surface-500">
            Headcount planning, costs, and hiring timeline
            {scenarioName && <span className="ml-2 text-surface-400">&mdash; {scenarioName}</span>}
          </p>
        </div>
        <AddHireForm
          scenarioId={scenarioId}
          departments={departments.map((d) => ({ id: d.id, name: d.name }))}
        />
      </div>

      <TeamView
        totalHeadcount={totalHeadcount}
        plannedCount={plannedHires.reduce((s, h) => s + h.count, 0)}
        totalMonthlyCost={totalMonthlyCost}
        costPercentOfBurn={costPercentOfBurn}
        revPerEmployee={revPerEmployee}
        deptGroupCount={deptGroups.size}
        departmentsCount={departments.length}
        departmentBreakdown={departmentBreakdown}
        plannedHires={plannedHiresData}
        scenarioId={scenarioId}
        departments={departments.map((d) => ({ id: d.id, name: d.name }))}
      />
    </div>
  );
}
