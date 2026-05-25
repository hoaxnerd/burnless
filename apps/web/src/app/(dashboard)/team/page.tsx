export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import { getCompany, getActiveScenario, getServerScenarioId, getHeadcountPlans, getDepartments, getTeamChildEntitiesByHeadcount } from "@/lib/data";
import { computeDashboardData } from "@/lib/compute-dashboard";
import { monthKey, METRIC_REGISTRY } from "@burnless/engine";
import type { ResolvedSlotData } from "@burnless/engine";
import { buildSlotMetricCard } from "@/lib/build-slot-metrics";
import { formatCurrency } from "@burnless/types";
import type { CurrencyCode } from "@burnless/types";
import { companyCurrency } from "@/lib/server-currency";
import { TeamView } from "./team-view";
import { HeadcountForm } from "./headcount-form";
import type { BenefitsBreakdown } from "@/lib/headcount-params";
import type { VestingMilestone } from "./vesting-schedule-editor";
import { ReportContentSkeleton } from "@/components/reports/report-skeleton";

export default async function TeamPage() {
  const scenarioId = await getServerScenarioId();
  const company = await getCompany();
  const scenario = company ? await getActiveScenario(company.id, scenarioId) : null;

  const companyBenefitsRates = (company?.benefitsRates as BenefitsBreakdown | null) ?? {};

  return (
    <Suspense fallback={<ReportContentSkeleton />}>
      <TeamContent
        companyId={company?.id}
        scenarioId={scenario?.id}
        scenarioName={scenario?.name}
        companyBenefitsRates={companyBenefitsRates}
        currency={companyCurrency(company)}
      />
    </Suspense>
  );
}

async function TeamContent({ companyId, scenarioId, scenarioName, companyBenefitsRates, currency }: { companyId?: string; scenarioId?: string; scenarioName?: string; companyBenefitsRates: BenefitsBreakdown; currency: CurrencyCode }) {
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

  const childEntities = await getTeamChildEntitiesByHeadcount(
    companyId,
    scenarioId,
    plans.map((p) => p.id),
  );

  const deptMap = new Map(departments.map((d) => [d.id, d.name]));

  const now = new Date();
  const currentMonth = monthKey(new Date(now.getFullYear(), now.getMonth(), 1));

  // Split into current team and planned hires
  const currentTeam = plans.filter((p) => p.startDate <= now);
  const plannedHires = plans.filter((p) => p.startDate > now);

  const totalHeadcount = currentTeam.reduce((sum, p) => sum + Number(p.count), 0);
  const totalMonthlyCost = currentTeam.reduce(
    (sum, p) => sum + (Number(p.salary) * Number(p.count) * (1 + Number(p.benefitsRate))) / 12,
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
    headcount: members.reduce((sum, m) => sum + Number(m.count), 0),
    monthlyCost: members.reduce(
      (sum, m) => sum + (Number(m.salary) * Number(m.count) * (1 + Number(m.benefitsRate))) / 12,
      0
    ),
    members: members.map((m) => {
      const child = childEntities.get(m.id);
      return {
        id: m.id,
        departmentId: m.departmentId,
        title: m.title,
        name: m.name ?? null,
        employeeType: m.employeeType,
        count: Number(m.count),
        salary: Number(m.salary),
        hourlyRate: m.hourlyRate == null ? null : Number(m.hourlyRate),
        hoursPerWeek: m.hoursPerWeek == null ? null : Number(m.hoursPerWeek),
        benefitsRate: Number(m.benefitsRate),
        startDate: m.startDate.toISOString(),
        endDate: m.endDate ? m.endDate.toISOString() : null,
        parameters: (m.parameters ?? null) as { benefitsBreakdown?: BenefitsBreakdown } | null,
        salaryChanges: (child?.salaryChanges ?? []).map((c) => ({
          id: c.id,
          effectiveDate: c.effectiveDate instanceof Date ? c.effectiveDate.toISOString() : String(c.effectiveDate),
          newSalary: Number(c.newSalary),
          reason: c.reason ?? null,
        })),
        bonuses: (child?.bonuses ?? []).map((b) => ({
          id: b.id,
          payoutMonth: b.payoutMonth instanceof Date ? b.payoutMonth.toISOString() : String(b.payoutMonth),
          amount: Number(b.amount),
          type: b.type,
          notes: b.notes ?? null,
        })),
        equityGrants: (child?.equityGrants ?? []).map((g) => ({
          id: g.id,
          grantDate: g.grantDate instanceof Date ? g.grantDate.toISOString() : String(g.grantDate),
          shares: Number(g.shares),
          strikePrice: g.strikePrice == null ? null : Number(g.strikePrice),
          grantType: g.grantType,
          parameters: (g.parameters ?? null) as { vestingSchedule?: VestingMilestone[] } | null,
        })),
      };
    }),
  }));

  const plannedHiresData = plannedHires.map((h) => {
    const child = childEntities.get(h.id);
    return {
      id: h.id,
      departmentId: h.departmentId,
      title: h.title,
      name: h.name ?? null,
      employeeType: h.employeeType,
      department: deptMap.get(h.departmentId) ?? "Other",
      salary: Number(h.salary),
      hourlyRate: h.hourlyRate == null ? null : Number(h.hourlyRate),
      hoursPerWeek: h.hoursPerWeek == null ? null : Number(h.hoursPerWeek),
      benefitsRate: Number(h.benefitsRate),
      startDate: h.startDate.toISOString(),
      endDate: h.endDate ? h.endDate.toISOString() : null,
      count: Number(h.count),
      parameters: (h.parameters ?? null) as { benefitsBreakdown?: BenefitsBreakdown } | null,
      salaryChanges: (child?.salaryChanges ?? []).map((c) => ({
        id: c.id,
        effectiveDate: c.effectiveDate instanceof Date ? c.effectiveDate.toISOString() : String(c.effectiveDate),
        newSalary: Number(c.newSalary),
        reason: c.reason ?? null,
      })),
      bonuses: (child?.bonuses ?? []).map((b) => ({
        id: b.id,
        payoutMonth: b.payoutMonth instanceof Date ? b.payoutMonth.toISOString() : String(b.payoutMonth),
        amount: Number(b.amount),
        type: b.type,
        notes: b.notes ?? null,
      })),
      equityGrants: (child?.equityGrants ?? []).map((g) => ({
        id: g.id,
        grantDate: g.grantDate instanceof Date ? g.grantDate.toISOString() : String(g.grantDate),
        shares: Number(g.shares),
        strikePrice: g.strikePrice == null ? null : Number(g.strikePrice),
        grantType: g.grantType,
        parameters: (g.parameters ?? null) as { vestingSchedule?: VestingMilestone[] } | null,
      })),
    };
  });

  const now2 = new Date();
  const prevMonth = monthKey(new Date(now2.getFullYear(), now2.getMonth() - 1, 1));

  // Build resolved slot data for ALL engine metrics (swap targets)
  const allEngineSlots: ResolvedSlotData[] = METRIC_REGISTRY.map((def) =>
    buildSlotMetricCard(def.slug, data.metrics, currentMonth, prevMonth)
  );

  // Build page-specific default cards as ResolvedSlotData
  const pageDefaultSlots: ResolvedSlotData[] = [
    {
      slotId: "metric-0",
      content: { type: "metric", slug: "totalHeadcount" },
      label: "Total Headcount",
      value: String(totalHeadcount),
      description: plannedHires.length > 0 ? `+${plannedHires.reduce((s, h) => s + Number(h.count), 0)} planned` : undefined,
      hasData: totalHeadcount > 0,
      metricStyle: { icon: "Users", color: "blue", href: "/team" },
    },
    {
      slotId: "metric-1",
      content: { type: "metric", slug: "monthlyPeopleCost" },
      label: "Monthly People Cost",
      value: formatCurrency(totalMonthlyCost, currency, undefined, { compact: true }),
      description: costPercentOfBurn > 0 ? `${costPercentOfBurn.toFixed(0)}% of total burn` : "Incl. salary + benefits",
      hasData: totalMonthlyCost > 0,
      metricStyle: { icon: "DollarSign", color: "emerald", href: "/team" },
    },
    {
      slotId: "metric-2",
      content: { type: "metric", slug: "revenuePerEmployee" },
      label: "Revenue / Employee",
      value: `${formatCurrency(revPerEmployee, currency, undefined, { compact: true })}/mo`,
      description: "Efficiency metric",
      hasData: revPerEmployee > 0,
      metricStyle: { icon: "TrendingUp", color: "teal", href: "/team" },
    },
    {
      slotId: "metric-3",
      content: { type: "metric", slug: "departments" },
      label: "Departments",
      value: String(deptGroups.size),
      description: `${departments.length} total defined`,
      hasData: true,
      metricStyle: { icon: "BarChart3", color: "violet", href: "/team" },
    },
  ];

  const resolvedSlotData = [...pageDefaultSlots, ...allEngineSlots];

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
        <HeadcountForm
          scenarioId={scenarioId}
          departments={departments.map((d) => ({ id: d.id, name: d.name }))}
          companyBenefitsRates={companyBenefitsRates}
        />
      </div>

      <TeamView
        totalHeadcount={totalHeadcount}
        plannedCount={plannedHires.reduce((s, h) => s + Number(h.count), 0)}
        totalMonthlyCost={totalMonthlyCost}
        costPercentOfBurn={costPercentOfBurn}
        revPerEmployee={revPerEmployee}
        deptGroupCount={deptGroups.size}
        departmentsCount={departments.length}
        departmentBreakdown={departmentBreakdown}
        plannedHires={plannedHiresData}
        resolvedSlotData={resolvedSlotData}
        scenarioId={scenarioId}
        departments={departments.map((d) => ({ id: d.id, name: d.name }))}
        companyBenefitsRates={companyBenefitsRates}
        currency={currency}
      />
    </div>
  );
}
