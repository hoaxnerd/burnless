"use client";

import { useMemo, type ReactNode } from "react";
import { PageGrid, type DefaultLayoutItem } from "@/components/ui";
import { PageLayoutProvider, usePageLayoutContext } from "@/components/providers/page-layout-context";
import { ComputedMetricsProvider } from "@/components/providers/computed-metrics-context";
import { FundingDetails } from "./funding-details";
import { PageProvider } from "@/components/providers/page-context";
import { CardCatalogProvider, type CardCatalogValue } from "@/components/providers/card-catalog-context";
import { SwappableMetricCard } from "@/components/ui/swappable-metric-card";
import { useMetrics } from "@/components/providers/metrics-context";
import { CATEGORY_META, getMetricDef, getMetricDependencyTree, getMetricDependents } from "@burnless/engine";
import type { ResolvedSlotData } from "@burnless/engine";
import { formatCurrency } from "@burnless/types";

interface FundingViewProps {
  totalRaised: number;
  completedRoundsCount: number;
  currentCash: number;
  currentBurn: number;
  currentRunway: number;
  foundersOwnership: number;
  totalDilution: number;
  rounds: Array<{
    id: string;
    name: string;
    type: string;
    amount: number;
    date: string;
    preMoneyValuation: number | null;
    dilutionPercent: number | null;
    isProjected: boolean;
  }>;
  resolvedSlotData: ResolvedSlotData[];
}

export function FundingView({
  totalRaised,
  completedRoundsCount,
  currentCash,
  currentBurn,
  currentRunway,
  foundersOwnership,
  totalDilution,
  rounds,
  resolvedSlotData,
}: FundingViewProps) {
  // ── Context wiring ──────────────────────────────────────────────────────
  const { registry, openFormulaViewer } = useMetrics();
  const usedSlugs = useMemo(() => new Set(["totalRaised", "currentCash", "runway", "founderOwnership"]), []);
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

  const fc = (v: number) => formatCurrency(v, "USD", undefined, { compact: true });

  const metricCards = useMemo((): Array<{ slug: string; label: string; value: string; change?: string; description?: string }> => [
    {
      slug: "totalRaised",
      label: "Total Raised",
      value: totalRaised > 0 ? fc(totalRaised) : "$---",
      description: totalRaised > 0 ? `${completedRoundsCount} round${completedRoundsCount !== 1 ? "s" : ""} completed` : "Add a funding round",
    },
    {
      slug: "currentCash",
      label: "Current Cash",
      value: currentCash > 0 ? fc(currentCash) : "$---",
      description: currentCash > 0 ? "Available capital" : "Add funding to see cash",
    },
    {
      slug: "runway",
      label: "Runway",
      value: currentBurn > 0 && currentCash > 0 ? (currentRunway >= 999 ? "\u221e" : `${Math.round(currentRunway)} months`) : "-- mo",
      description: currentBurn > 0 && currentCash > 0 ? `At ${fc(currentBurn)}/mo burn` : "Add funding & expenses",
    },
    {
      slug: "founderOwnership",
      label: "Founder Ownership",
      value: completedRoundsCount > 0 ? `${foundersOwnership.toFixed(0)}%` : "--%",
      description: completedRoundsCount > 0 ? `After ${totalDilution.toFixed(0)}% dilution` : "Add a funding round",
    },
  ], [totalRaised, completedRoundsCount, currentCash, currentBurn, currentRunway, foundersOwnership, totalDilution]);

  const widgets = useMemo(() => ({
    ...Object.fromEntries(
      metricCards.map((card, i) => [
        `metric-${i}`,
        <SwappableMetricCard
          key={`metric-${i}`}
          slug={card.slug}
          label={card.label}
          value={card.value}
          change={card.change}
          description={card.description}
          stagger={i}
        />,
      ])
    ),
    "details": (
      <FundingDetails
        rounds={rounds}
        foundersOwnership={foundersOwnership}
        currentCash={currentCash}
        currentBurn={currentBurn}
        currentRunway={currentRunway}
      />
    ),
  }), [metricCards, rounds, foundersOwnership, currentCash, currentBurn, currentRunway]);

  return (
    <PageLayoutProvider pageId="funding">
      <ComputedMetricsProvider slotData={resolvedSlotData}>
        <PageProvider pageId="funding">
          <CardCatalogProvider value={catalogValue}>
            <FundingPageGrid
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

function FundingPageGrid({
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
