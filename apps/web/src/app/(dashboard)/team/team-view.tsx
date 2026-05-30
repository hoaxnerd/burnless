"use client";

import { useMemo } from "react";
import { ConnectedPageGrid, type DefaultLayoutItem } from "@/components/ui";
import { PageLayoutProvider } from "@/components/providers/page-layout-context";
import { ComputedMetricsProvider } from "@/components/providers/computed-metrics-context";
import { TeamRoster, PlannedHiresSection, HiringInsightTip } from "./team-details";
import { AiPageInsights } from "@/components/ai/ai-page-insights";
import { PageProvider } from "@/components/providers/page-context";
import { CardCatalogProvider, type CardCatalogValue } from "@/components/providers/card-catalog-context";
import { SwappableMetricCard } from "@/components/ui/swappable-metric-card";
import { useMetrics } from "@/components/providers/metrics-context";
import { CATEGORY_META, getMetricDef, getMetricDependencyTree, getMetricDependents } from "@burnless/engine";
import type { ResolvedSlotData } from "@burnless/engine";
import type { CurrencyCode } from "@burnless/types";
import type { BenefitsBreakdown } from "@/lib/headcount-params";
import type { SalaryChange } from "./salary-changes-list";
import type { Bonus } from "./bonuses-list";
import type { EquityGrant } from "./equity-grants-list";

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
      name?: string | null;
      employeeType?: "full_time" | "part_time" | "contractor";
      count: number;
      salary: number;
      hourlyRate?: number | null;
      hoursPerWeek?: number | null;
      benefitsRate: number;
      startDate: string;
      endDate: string | null;
      parameters?: { benefitsBreakdown?: BenefitsBreakdown } | null;
      salaryChanges: SalaryChange[];
      bonuses: Bonus[];
      equityGrants: EquityGrant[];
    }>;
  }>;
  plannedHires: Array<{
    id: string;
    departmentId: string;
    title: string;
    name?: string | null;
    employeeType?: "full_time" | "part_time" | "contractor";
    department: string;
    salary: number;
    hourlyRate?: number | null;
    hoursPerWeek?: number | null;
    benefitsRate: number;
    startDate: string;
    endDate: string | null;
    count: number;
    parameters?: { benefitsBreakdown?: BenefitsBreakdown } | null;
    salaryChanges: SalaryChange[];
    bonuses: Bonus[];
    equityGrants: EquityGrant[];
  }>;
  resolvedSlotData: ResolvedSlotData[];
  scenarioId: string;
  departments: Array<{ id: string; name: string }>;
  companyBenefitsRates: BenefitsBreakdown;
  currency: CurrencyCode;
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
  companyBenefitsRates,
  currency,
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
    { i: "metric-0",       x: 0, w: 3,  h: 5,  minW: 2, minH: 4 },
    { i: "metric-1",       x: 3, w: 3,  h: 5,  minW: 2, minH: 4 },
    { i: "metric-2",       x: 6, w: 3,  h: 5,  minW: 2, minH: 4 },
    { i: "metric-3",       x: 9, w: 3,  h: 5,  minW: 2, minH: 4 },
    { i: "ai-insights",    x: 0, w: 12, h: 4,  minH: 3 },
    { i: "team-roster",    x: 0, w: 12, h: 14, minH: 8 },
    { i: "planned-hires",  x: 0, w: 12, h: 10, minH: 6 },
    { i: "hiring-insight", x: 0, w: 12, h: 3,  minH: 2 },
  ], []);

  const defaultLayoutSM: DefaultLayoutItem[] = useMemo(() => [
    { i: "metric-0",       x: 0, w: 6, h: 5,  minW: 2, minH: 4 },
    { i: "metric-1",       x: 0, w: 6, h: 5,  minW: 2, minH: 4 },
    { i: "metric-2",       x: 0, w: 6, h: 5,  minW: 2, minH: 4 },
    { i: "metric-3",       x: 0, w: 6, h: 5,  minW: 2, minH: 4 },
    { i: "ai-insights",    x: 0, w: 6, h: 4,  minH: 3 },
    { i: "team-roster",    x: 0, w: 6, h: 14, minH: 8 },
    { i: "planned-hires",  x: 0, w: 6, h: 10, minH: 6 },
    { i: "hiring-insight", x: 0, w: 6, h: 3,  minH: 2 },
  ], []);

  const staticHiddenWidgets = useMemo(
    () => plannedHires.length === 0 ? ["hiring-insight"] : [],
    [plannedHires.length],
  );

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
    "team-roster": (
      <TeamRoster
        departmentBreakdown={departmentBreakdown}
        totalMonthlyCost={totalMonthlyCost}
        departments={departments}
        companyBenefitsRates={companyBenefitsRates}
        currency={currency}
      />
    ),
    "planned-hires": (
      <PlannedHiresSection
        plannedHires={plannedHires}
        departments={departments}
        companyBenefitsRates={companyBenefitsRates}
        currency={currency}
      />
    ),
    "hiring-insight": (
      <HiringInsightTip plannedHires={plannedHires} currency={currency} />
    ),
    "ai-insights": (
      <AiPageInsights
        page="team"
        scenarioId={scenarioId}
        pageData={{
          departments: departmentBreakdown,
          plannedHires: plannedHires.length,
        }}
      />
    ),
  }), [slotById, departmentBreakdown, plannedHires, totalMonthlyCost, scenarioId, departments, companyBenefitsRates, currency]);

  return (
    <PageLayoutProvider pageId="team">
      <ComputedMetricsProvider slotData={resolvedSlotData}>
        <PageProvider pageId="team">
          <CardCatalogProvider value={catalogValue}>
            <ConnectedPageGrid
              widgets={widgets}
              defaultLayoutLG={defaultLayoutLG}
              defaultLayoutSM={defaultLayoutSM}
              staticHiddenWidgets={staticHiddenWidgets}
            />
          </CardCatalogProvider>
        </PageProvider>
      </ComputedMetricsProvider>
    </PageLayoutProvider>
  );
}
