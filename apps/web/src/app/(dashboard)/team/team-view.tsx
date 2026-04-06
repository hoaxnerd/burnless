"use client";

import { useMemo, type ReactNode } from "react";
import { PageGrid, type DefaultLayoutItem } from "@/components/ui";
import { PageLayoutProvider, usePageLayoutContext } from "@/components/providers/page-layout-context";
import { ComputedMetricsProvider } from "@/components/providers/computed-metrics-context";
import { TeamDetails } from "./team-details";
import { PageProvider } from "@/components/providers/page-context";
import { CardCatalogProvider, type CardCatalogValue } from "@/components/providers/card-catalog-context";
import { SwappableMetricCard } from "@/components/ui/swappable-metric-card";
import { useMetrics } from "@/components/providers/metrics-context";
import { CATEGORY_META, getMetricDef, getMetricDependencyTree, getMetricDependents } from "@burnless/engine";
import type { ResolvedSlotData } from "@burnless/engine";

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
  // Render metric cards directly from resolvedSlotData (keyed by slotId)
  const slotById = useMemo(() => {
    const map = new Map<string, ResolvedSlotData>();
    for (const s of resolvedSlotData) map.set(s.slotId, s);
    return map;
  }, [resolvedSlotData]);

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
    { i: "metric-0", x: 0, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-1", x: 3, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-2", x: 6, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-3", x: 9, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "details",      x: 0, w: 12, h: 16, minH: 8 },
  ], []);

  const defaultLayoutSM: DefaultLayoutItem[] = useMemo(() => [
    { i: "metric-0", x: 0, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-1", x: 3, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-2", x: 0, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "metric-3", x: 3, w: 3, h: 5, minW: 2, minH: 4 },
    { i: "details",      x: 0, w: 6, h: 16, minH: 8 },
  ], []);

  const widgets = useMemo(() => ({
    ...Object.fromEntries(
      ["metric-0", "metric-1", "metric-2", "metric-3"].map((slotId, i) => {
        const slot = slotById.get(slotId);
        if (!slot) return [slotId, null];
        return [
          slotId,
          <SwappableMetricCard
            key={slotId}
            slug={slot.content.slug}
            label={slot.label}
            value={slot.value}
            change={slot.change}
            changeLabel={slot.changeLabel}
            description={slot.description}
            sparkData={slot.sparkData}
            metricStyle={slot.metricStyle}
            hasData={slot.hasData}
            stagger={i}
          />,
        ];
      })
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
  }), [slotById, departmentBreakdown, plannedHires, totalMonthlyCost, scenarioId, departments]);

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
