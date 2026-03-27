"use client";

import { useMemo } from "react";
import { SwappableMetricCard, PageGrid, type DefaultLayoutItem } from "@/components/ui";
import { usePageLayout } from "@/components/ui/use-page-layout";
import { TeamDetails } from "./team-details";

interface TeamViewProps {
  totalHeadcount: number;
  plannedCount: number;
  totalMonthlyCost: number;
  costPercentOfBurn: number;
  revPerEmployee: number;
  deptGroupCount: number;
  departmentsCount: number;
  departmentBreakdown: Array<{
    department: string;
    headcount: number;
    monthlyCost: number;
    members: Array<{
      id: string;
      departmentId: string;
      title: string;
      count: number;
      salary: number;
      benefitsRate: number;
      startDate: string;
      endDate: string | null;
    }>;
  }>;
  plannedHires: Array<{
    id: string;
    departmentId: string;
    title: string;
    department: string;
    salary: number;
    benefitsRate: number;
    startDate: string;
    endDate: string | null;
    count: number;
  }>;
  scenarioId: string;
  departments: Array<{ id: string; name: string }>;
}

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

export function TeamView({
  totalHeadcount,
  plannedCount,
  totalMonthlyCost,
  costPercentOfBurn,
  revPerEmployee,
  deptGroupCount,
  departmentsCount,
  departmentBreakdown,
  plannedHires,
  scenarioId,
  departments,
}: TeamViewProps) {
  const pageLayout = usePageLayout({ pageId: "team" });

  const defaultLayoutLG: DefaultLayoutItem[] = useMemo(() => [
    { i: "metric-cards", x: 0, w: 12, h: 5, minH: 4 },
    { i: "details",      x: 0, w: 12, h: 16, minH: 8 },
  ], []);

  const widgets = useMemo(() => ({
    "metric-cards": (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <SwappableMetricCard
          slug="totalHeadcount"
          pageId="team"
          label="Total Headcount"
          value={String(totalHeadcount)}
          description={plannedCount > 0 ? `+${plannedCount} planned` : undefined}
        />
        <SwappableMetricCard
          slug="monthlyPeopleCost"
          pageId="team"
          label="Monthly People Cost"
          value={formatCurrency(totalMonthlyCost)}
          description={costPercentOfBurn > 0 ? `${costPercentOfBurn.toFixed(0)}% of total burn` : "Incl. salary + benefits"}
        />
        <SwappableMetricCard
          slug="revenuePerEmployee"
          pageId="team"
          label="Revenue / Employee"
          value={`${formatCurrency(revPerEmployee)}/mo`}
          description="Efficiency metric"
        />
        <SwappableMetricCard
          slug="departments"
          pageId="team"
          label="Departments"
          value={String(deptGroupCount)}
          description={`${departmentsCount} total defined`}
        />
      </div>
    ),
    "details": (
      <TeamDetails
        departmentBreakdown={departmentBreakdown}
        plannedHires={plannedHires}
        totalMonthlyCost={totalMonthlyCost}
        scenarioId={scenarioId}
        departments={departments}
      />
    ),
  }), [totalHeadcount, plannedCount, totalMonthlyCost, costPercentOfBurn, revPerEmployee, deptGroupCount, departmentsCount, departmentBreakdown, plannedHires, scenarioId, departments]);

  return (
    <PageGrid
      widgets={widgets}
      defaultLayoutLG={defaultLayoutLG}
      {...pageLayout}
    />
  );
}
