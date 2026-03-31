"use client";

import { useMemo, type ReactNode } from "react";
import { PageGrid, type DefaultLayoutItem } from "@/components/ui";
import { PageLayoutProvider, usePageLayoutContext } from "@/components/providers/page-layout-context";
import { ComputedMetricsProvider } from "@/components/providers/computed-metrics-context";
import { TeamDetails } from "./team-details";
import { PageProvider } from "@/components/providers/page-context";
import { CardCatalogProvider, type CardCatalogValue } from "@/components/providers/card-catalog-context";
import { MetricCardsGrid, type MetricCardConfig } from "@/components/ui/metric-cards-grid";
import { useMetrics } from "@/components/providers/metrics-context";
import { CATEGORY_META, getMetricDef, getMetricDependencyTree, getMetricDependents } from "@burnless/engine";
import type { ResolvedSlotData } from "@burnless/engine";
import { formatCurrency } from "@burnless/types";

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
  resolvedSlotData: ResolvedSlotData[];
  scenarioId: string;
  departments: Array<{ id: string; name: string }>;
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
  resolvedSlotData,
  scenarioId,
  departments,
}: TeamViewProps) {
  // ── Context wiring ──────────────────────────────────────────────────────
  const { registry, openFormulaViewer } = useMetrics();
  const usedSlugs = useMemo(() => new Set(["totalHeadcount", "monthlyPeopleCost", "revenuePerEmployee", "departments"]), []);
  const catalogValue: CardCatalogValue = useMemo(() => ({
    registry,
    usedSlugs,
    heroSlugs: [],
    onSelect: () => {},
    onRemove: () => {},
    onViewFormula: openFormulaViewer,
    categoryMeta: CATEGORY_META as Record<string, { label: string }>,
    getDependencyTree: getMetricDependencyTree,
    getDependents: getMetricDependents,
    getMetricDef: getMetricDef as CardCatalogValue["getMetricDef"],
    swapMode: false,
    cardType: "metric" as const,
  }), [registry, usedSlugs, openFormulaViewer]);

  const defaultLayoutLG: DefaultLayoutItem[] = useMemo(() => [
    { i: "metric-cards", x: 0, w: 12, h: 5, minH: 4 },
    { i: "details",      x: 0, w: 12, h: 16, minH: 8 },
  ], []);

  const defaultLayoutSM: DefaultLayoutItem[] = useMemo(
    () => defaultLayoutLG.map((item) => ({ ...item, x: 0, w: 6 })),
    [defaultLayoutLG]
  );

  const metricCards: MetricCardConfig[] = useMemo(() => [
    {
      slug: "totalHeadcount",
      label: "Total Headcount",
      value: String(totalHeadcount),
      description: plannedCount > 0 ? `+${plannedCount} planned` : undefined,
    },
    {
      slug: "monthlyPeopleCost",
      label: "Monthly People Cost",
      value: formatCurrency(totalMonthlyCost, "USD", undefined, { compact: true }),
      description: costPercentOfBurn > 0 ? `${costPercentOfBurn.toFixed(0)}% of total burn` : "Incl. salary + benefits",
    },
    {
      slug: "revenuePerEmployee",
      label: "Revenue / Employee",
      value: `${formatCurrency(revPerEmployee, "USD", undefined, { compact: true })}/mo`,
      description: "Efficiency metric",
    },
    {
      slug: "departments",
      label: "Departments",
      value: String(deptGroupCount),
      description: `${departmentsCount} total defined`,
    },
  ], [totalHeadcount, plannedCount, totalMonthlyCost, costPercentOfBurn, revPerEmployee, deptGroupCount, departmentsCount]);

  const widgets = useMemo(() => ({
    "metric-cards": <MetricCardsGrid cards={metricCards} gap={6} />,
    "details": (
      <TeamDetails
        departmentBreakdown={departmentBreakdown}
        plannedHires={plannedHires}
        totalMonthlyCost={totalMonthlyCost}
        scenarioId={scenarioId}
        departments={departments}
      />
    ),
  }), [metricCards, departmentBreakdown, plannedHires, totalMonthlyCost, scenarioId, departments]);

  return (
    <PageLayoutProvider pageId="team">
      <ComputedMetricsProvider slotData={resolvedSlotData}>
        <PageProvider pageId="team">
          <CardCatalogProvider value={catalogValue}>
            <TeamPageGrid
              widgets={widgets}
              defaultLayoutLG={defaultLayoutLG}
              defaultLayoutSM={defaultLayoutSM}
            />
          </CardCatalogProvider>
        </PageProvider>
      </ComputedMetricsProvider>
    </PageLayoutProvider>
  );
}

function TeamPageGrid({
  widgets,
  defaultLayoutLG,
  defaultLayoutSM,
}: {
  widgets: Record<string, ReactNode>;
  defaultLayoutLG: DefaultLayoutItem[];
  defaultLayoutSM: DefaultLayoutItem[];
}) {
  const layout = usePageLayoutContext();
  return (
    <PageGrid
      widgets={widgets}
      defaultLayoutLG={defaultLayoutLG}
      defaultLayoutSM={defaultLayoutSM}
      savedLayout={layout.savedLayout}
      onLayoutChange={layout.onLayoutChange}
      closedWidgets={layout.closedWidgets}
      onCloseWidget={layout.onCloseWidget}
      onOpenWidget={layout.onOpenWidget}
      onReset={layout.onReset}
      widgetReadiness={layout.widgetReadiness}
      isLoading={layout.isLoading}
      isEditMode={layout.isEditMode}
      setIsEditMode={layout.setIsEditMode}
    />
  );
}
