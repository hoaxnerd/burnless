"use client";

import { useMemo } from "react";
import { PageGrid, type DefaultLayoutItem } from "@/components/ui";
import { usePageLayout } from "@/components/ui/use-page-layout";
import { FundingDetails } from "./funding-details";
import { PageProvider } from "@/components/providers/page-context";
import { CardCatalogProvider, type CardCatalogValue } from "@/components/providers/card-catalog-context";
import { MetricCardsGrid, type MetricCardConfig } from "@/components/ui/metric-cards-grid";
import { useMetrics } from "@/components/providers/metrics-context";
import { CATEGORY_META, getMetricDef, getMetricDependencyTree, getMetricDependents } from "@burnless/engine";
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

  const pageLayout = usePageLayout({ pageId: "funding" });

  const defaultLayoutLG: DefaultLayoutItem[] = useMemo(() => [
    { i: "metric-cards", x: 0, w: 12, h: 5, minH: 4 },
    { i: "details",      x: 0, w: 12, h: 16, minH: 8 },
  ], []);

  const fc = (v: number) => formatCurrency(v, "USD", undefined, { compact: true });

  const metricCards: MetricCardConfig[] = useMemo(() => [
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
      variant: currentRunway > 0 && currentRunway < 6 ? "danger" : currentRunway < 12 ? "warning" : "default",
    },
    {
      slug: "founderOwnership",
      label: "Founder Ownership",
      value: completedRoundsCount > 0 ? `${foundersOwnership.toFixed(0)}%` : "--%",
      description: completedRoundsCount > 0 ? `After ${totalDilution.toFixed(0)}% dilution` : "Add a funding round",
    },
  ], [totalRaised, completedRoundsCount, currentCash, currentBurn, currentRunway, foundersOwnership, totalDilution]);

  const widgets = useMemo(() => ({
    "metric-cards": <MetricCardsGrid cards={metricCards} gap={6} />,
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
    <PageProvider pageId="funding">
      <CardCatalogProvider value={catalogValue}>
        <PageGrid
          widgets={widgets}
          defaultLayoutLG={defaultLayoutLG}
          {...pageLayout}
        />
      </CardCatalogProvider>
    </PageProvider>
  );
}
