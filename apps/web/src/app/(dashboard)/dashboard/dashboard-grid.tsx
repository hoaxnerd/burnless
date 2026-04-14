"use client";

/**
 * DashboardGrid — dashboard-specific wrapper around the generic PageGrid.
 *
 * Bridges the DashboardIntelligenceProvider context with the
 * props-driven PageGrid component. Generates hero card layout items
 * and appends the standard non-hero widget layouts.
 *
 * Layout state (savedLayout, closedWidgets, widgetReadiness, isEditMode)
 * comes from PageLayoutProvider via usePageLayoutContext().
 * Card state (heroCards, secondaryMetrics) comes from DashboardLayoutContext.
 */

import { type ReactNode, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ConnectedPageGrid, type DefaultLayoutItem } from "@/components/ui";
import { PageProvider } from "@/components/providers/page-context";
import { CardCatalogProvider, type CardCatalogValue } from "@/components/providers/card-catalog-context";
import { useMetrics } from "@/components/providers/metrics-context";
import { CATEGORY_META, getMetricDef, getMetricDependencyTree, getMetricDependents } from "@burnless/engine";
import { useDashboardLayout } from "./dashboard-layout-context";

// ── Widget ID type ──────────────────────────────────────────────────────────

export type WidgetId =
  | `hero-${number}`
  | "ai-insights"
  | "weekly-digest"
  | "pinned-insights"
  | "chart-cash"
  | "chart-rev-exp"
  | "chart-burn-runway"
  | "chart-mrr"
  | "custom-metrics";

// ── Default layouts ─────────────────────────────────────────────────────────

const NON_HERO_LAYOUT_LG: DefaultLayoutItem[] = [
  { i: "weekly-digest",     x: 0,  w: 12, h: 3, minW: 6, minH: 2 },
  { i: "ai-insights",       x: 0,  w: 12, h: 8, minW: 6, minH: 4 },
  { i: "chart-cash",        x: 0,  w: 6,  h: 10, minW: 4, minH: 7 },
  { i: "chart-rev-exp",     x: 6,  w: 6,  h: 10, minW: 4, minH: 7 },
  { i: "custom-metrics",    x: 0,  w: 12, h: 8, minW: 6, minH: 5 },
  { i: "chart-burn-runway", x: 0,  w: 6,  h: 10, minW: 4, minH: 7 },
  { i: "chart-mrr",         x: 6,  w: 6,  h: 10, minW: 4, minH: 7 },
];

const NON_HERO_LAYOUT_SM: DefaultLayoutItem[] = [
  { i: "weekly-digest",     x: 0, w: 6, h: 3, minW: 6, minH: 2 },
  { i: "ai-insights",       x: 0, w: 6, h: 8, minW: 6, minH: 4 },
  { i: "chart-cash",        x: 0, w: 6, h: 10, minW: 6, minH: 7 },
  { i: "chart-rev-exp",     x: 0, w: 6, h: 10, minW: 6, minH: 7 },
  { i: "custom-metrics",    x: 0, w: 6, h: 8, minW: 6, minH: 5 },
  { i: "chart-burn-runway", x: 0, w: 6, h: 10, minW: 6, minH: 7 },
  { i: "chart-mrr",         x: 0, w: 6, h: 10, minW: 6, minH: 7 },
];

function generateHeroItems(heroCount: number, cols: number): DefaultLayoutItem[] {
  const heroH = 5;
  const perRow = cols === 12 ? 4 : 2;
  const heroW = cols === 12 ? 3 : 3;
  const minW = cols === 12 ? 2 : 3;
  const items: DefaultLayoutItem[] = [];

  for (let i = 0; i < heroCount; i++) {
    items.push({
      i: `hero-${i}`,
      x: (i % perRow) * heroW,
      w: heroW,
      h: heroH,
      minW,
      minH: 4,
    });
  }
  return items;
}

// ── Main Component ──────────────────────────────────────────────────────────

interface DashboardGridProps {
  widgets: Partial<Record<WidgetId, ReactNode>>;
  hiddenWidgets?: WidgetId[];
}

export function DashboardGrid({ widgets, hiddenWidgets = [] }: DashboardGridProps) {
  const router = useRouter();
  const { registry, openFormulaViewer } = useMetrics();

  // Card state from DashboardLayoutContext
  const {
    heroCards,
    secondaryMetrics,
    addSecondaryMetric,
    removeSecondaryMetric,
    swapHeroCard,
  } = useDashboardLayout();

  const allUsedSlugs = useMemo(
    () => new Set([...heroCards, ...secondaryMetrics]),
    [heroCards, secondaryMetrics]
  );

  const catalogValue: CardCatalogValue = useMemo(() => ({
    registry,
    usedSlugs: allUsedSlugs,
    heroSlugs: heroCards,
    onSelect: addSecondaryMetric,
    onRemove: removeSecondaryMetric,
    onViewFormula: openFormulaViewer,
    categoryMeta: CATEGORY_META as Record<string, { label: string }>,
    getDependencyTree: getMetricDependencyTree,
    getDependents: getMetricDependents,
    getMetricDef: getMetricDef as CardCatalogValue["getMetricDef"],
    swapMode: false,
    cardType: "metric" as const,
    onSaveForCard: (cardSlug: string, selectedSlug: string) => {
      const heroIndex = heroCards.indexOf(cardSlug);
      if (heroIndex >= 0) {
        swapHeroCard(heroIndex, selectedSlug).then(() => router.refresh());
      }
    },
  }), [registry, allUsedSlugs, heroCards, addSecondaryMetric, removeSecondaryMetric, openFormulaViewer, swapHeroCard, router]);

  const heroCount = heroCards.length || 4;

  const defaultLayoutLG = useMemo(
    () => [...generateHeroItems(heroCount, 12), ...NON_HERO_LAYOUT_LG],
    [heroCount]
  );
  const defaultLayoutSM = useMemo(
    () => [...generateHeroItems(heroCount, 6), ...NON_HERO_LAYOUT_SM],
    [heroCount]
  );

  return (
    <PageProvider pageId="dashboard">
      <CardCatalogProvider value={catalogValue}>
        <ConnectedPageGrid
          widgets={widgets as Record<string, ReactNode>}
          defaultLayoutLG={defaultLayoutLG}
          defaultLayoutSM={defaultLayoutSM}
          staticHiddenWidgets={hiddenWidgets}
        />
      </CardCatalogProvider>
    </PageProvider>
  );
}

export function generateDefaultLayout(
  heroCount: number,
  cols: number,
  nonHeroItems: readonly { i: string; x: number; w: number; h: number; minW?: number; minH?: number }[],
) {
  const heroH = 5;
  const perRow = cols === 12 ? 4 : 2;
  const heroW = cols === 12 ? 3 : 3;
  const minW = cols === 12 ? 2 : 3;
  const items: Array<{ i: string; x: number; y: number; w: number; h: number; minW?: number; minH?: number }> = [];

  for (let i = 0; i < heroCount; i++) {
    items.push({
      i: `hero-${i}`,
      x: (i % perRow) * heroW,
      y: Math.floor(i / perRow) * heroH,
      w: heroW,
      h: heroH,
      minW,
      minH: 4,
    });
  }

  const heroRows = Math.ceil(heroCount / perRow);
  let yOffset = heroRows * heroH;
  for (const item of nonHeroItems) {
    items.push({ ...item, y: yOffset });
    if (item.x === 0) yOffset += item.h;
  }

  return items;
}
