"use client";

import { useState, useMemo } from "react";
import { ConnectedPageGrid, type DefaultLayoutItem } from "@/components/ui";
import { PageLayoutProvider } from "@/components/providers/page-layout-context";
import { ComputedMetricsProvider } from "@/components/providers/computed-metrics-context";
import { OwnershipChart, FundingRoundsList, DilutionCalculator, FundraisingReadinessTip } from "./funding-details";
import { AiPageInsights } from "@/components/ai/ai-page-insights";
import { PageProvider } from "@/components/providers/page-context";
import { CardCatalogProvider, type CardCatalogValue } from "@/components/providers/card-catalog-context";
import { SwappableMetricCard } from "@/components/ui/swappable-metric-card";
import { useMetrics } from "@/components/providers/metrics-context";
import { CATEGORY_META, getMetricDef, getMetricDependencyTree, getMetricDependents } from "@burnless/engine";
import type { ResolvedSlotData } from "@burnless/engine";

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
  // Render metric cards directly from resolvedSlotData (keyed by slotId)
  const slotById = useMemo(() => {
    const map = new Map<string, ResolvedSlotData>();
    for (const s of resolvedSlotData) map.set(s.slotId, s);
    return map;
  }, [resolvedSlotData]);

  // Dilution calculator state (lifted so it can be shared across widgets)
  const [calcRaiseAmount, setCalcRaiseAmount] = useState(2_000_000);
  const [calcPreMoney, setCalcPreMoney] = useState(8_000_000);

  const calcDilution = useMemo(() => {
    const postMoney = calcPreMoney + calcRaiseAmount;
    if (postMoney <= 0) return { dilution: 0, postMoney: 0, newOwnership: foundersOwnership };
    const dilution = (calcRaiseAmount / postMoney) * 100;
    const newOwnership = foundersOwnership * (1 - dilution / 100);
    return { dilution, postMoney, newOwnership };
  }, [calcRaiseAmount, calcPreMoney, foundersOwnership]);

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
    { i: "metric-0",         x: 0, w: 3,  h: 5,  minW: 2, minH: 4 },
    { i: "metric-1",         x: 3, w: 3,  h: 5,  minW: 2, minH: 4 },
    { i: "metric-2",         x: 6, w: 3,  h: 5,  minW: 2, minH: 4 },
    { i: "metric-3",         x: 9, w: 3,  h: 5,  minW: 2, minH: 4 },
    { i: "ownership",        x: 0, w: 4,  h: 12, minH: 8 },
    { i: "funding-rounds",   x: 4, w: 8,  h: 12, minH: 6 },
    { i: "dilution-calc",    x: 0, w: 12, h: 8,  minH: 5 },
    { i: "fundraising-tip",  x: 0, w: 12, h: 3,  minH: 2 },
  ], []);

  const defaultLayoutSM: DefaultLayoutItem[] = useMemo(() => [
    { i: "metric-0",         x: 0, w: 6, h: 5,  minW: 2, minH: 4 },
    { i: "metric-1",         x: 0, w: 6, h: 5,  minW: 2, minH: 4 },
    { i: "metric-2",         x: 0, w: 6, h: 5,  minW: 2, minH: 4 },
    { i: "metric-3",         x: 0, w: 6, h: 5,  minW: 2, minH: 4 },
    { i: "ownership",        x: 0, w: 6, h: 12, minH: 8 },
    { i: "funding-rounds",   x: 0, w: 6, h: 12, minH: 6 },
    { i: "dilution-calc",    x: 0, w: 6, h: 8,  minH: 5 },
    { i: "fundraising-tip",  x: 0, w: 6, h: 3,  minH: 2 },
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
    "ownership": (
      <OwnershipChart
        foundersOwnership={foundersOwnership}
        completedRounds={rounds.filter((r) => !r.isProjected)}
      />
    ),
    "funding-rounds": (
      <FundingRoundsList
        rounds={rounds}
        foundersOwnership={foundersOwnership}
        calcRaiseAmount={calcRaiseAmount}
        setCalcRaiseAmount={setCalcRaiseAmount}
        calcPreMoney={calcPreMoney}
        setCalcPreMoney={setCalcPreMoney}
        calcDilution={calcDilution}
      />
    ),
    "dilution-calc": (
      <DilutionCalculator
        foundersOwnership={foundersOwnership}
        calcRaiseAmount={calcRaiseAmount}
        setCalcRaiseAmount={setCalcRaiseAmount}
        calcPreMoney={calcPreMoney}
        setCalcPreMoney={setCalcPreMoney}
        calcDilution={calcDilution}
      />
    ),
    "fundraising-tip": (
      <FundraisingReadinessTip currentRunway={currentRunway} currentBurn={currentBurn} />
    ),
    "ai-insights": (
      <AiPageInsights
        page="funding"
        pageData={{
          fundingRounds: rounds,
        }}
      />
    ),
  }), [slotById, rounds, foundersOwnership, currentBurn, currentRunway, calcRaiseAmount, calcPreMoney, calcDilution, setCalcRaiseAmount, setCalcPreMoney]);

  const staticHiddenWidgets = useMemo(
    () => (currentRunway > 0 && currentRunway < 18) ? [] : ["fundraising-tip"],
    [currentRunway]
  );

  // Suppress unused variable warnings for props that are part of the interface
  void totalRaised;
  void completedRoundsCount;
  void totalDilution;

  return (
    <PageLayoutProvider pageId="funding">
      <ComputedMetricsProvider slotData={resolvedSlotData}>
        <PageProvider pageId="funding">
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
