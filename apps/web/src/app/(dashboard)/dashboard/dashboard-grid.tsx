"use client";

/**
 * DashboardGrid — dashboard-specific wrapper around the generic PageGrid.
 *
 * Bridges the DashboardIntelligenceProvider context with the
 * props-driven PageGrid component. Generates hero card layout items
 * and appends the standard non-hero widget layouts.
 */

import { type ReactNode, useMemo } from "react";
import { PageGrid, type DefaultLayoutItem, type PageWidgetLayout } from "@/components/ui/page-grid";
import { useDashboardIntelligence, type WidgetLayout } from "./dashboard-intelligence-context";

// ── Widget ID type ──────────────────────────────────────────────────────────

export type WidgetId =
  | `hero-${number}`
  | "ai-command-center"
  | "weekly-digest"
  | "quick-actions"
  | "chart-cash"
  | "chart-rev-exp"
  | "chart-burn-runway"
  | "chart-mrr"
  | "scenarios"
  | "custom-metrics";

// ── Default layouts ─────────────────────────────────────────────────────────

const NON_HERO_LAYOUT_LG: DefaultLayoutItem[] = [
  { i: "weekly-digest",     x: 0,  w: 12, h: 3, minW: 6, minH: 2 },
  { i: "ai-command-center", x: 0,  w: 12, h: 12, minW: 6, minH: 5 },
  { i: "quick-actions",     x: 0,  w: 12, h: 2, minW: 6, minH: 2 },
  { i: "chart-cash",        x: 0,  w: 6,  h: 10, minW: 4, minH: 7 },
  { i: "chart-rev-exp",     x: 6,  w: 6,  h: 10, minW: 4, minH: 7 },
  { i: "chart-burn-runway", x: 0,  w: 6,  h: 10, minW: 4, minH: 7 },
  { i: "chart-mrr",         x: 6,  w: 6,  h: 10, minW: 4, minH: 7 },
  { i: "scenarios",         x: 0,  w: 6,  h: 8, minW: 4, minH: 5 },
  { i: "custom-metrics",    x: 6,  w: 6,  h: 8, minW: 4, minH: 5 },
];

const NON_HERO_LAYOUT_SM: DefaultLayoutItem[] = [
  { i: "weekly-digest",     x: 0, w: 6, h: 3, minW: 6, minH: 2 },
  { i: "ai-command-center", x: 0, w: 6, h: 12, minW: 6, minH: 5 },
  { i: "quick-actions",     x: 0, w: 6, h: 2, minW: 6, minH: 2 },
  { i: "chart-cash",        x: 0, w: 6, h: 10, minW: 6, minH: 7 },
  { i: "chart-rev-exp",     x: 0, w: 6, h: 10, minW: 6, minH: 7 },
  { i: "chart-burn-runway", x: 0, w: 6, h: 10, minW: 6, minH: 7 },
  { i: "chart-mrr",         x: 0, w: 6, h: 10, minW: 6, minH: 7 },
  { i: "scenarios",         x: 0, w: 6, h: 8, minW: 6, minH: 5 },
  { i: "custom-metrics",    x: 0, w: 6, h: 8, minW: 6, minH: 5 },
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

/** Convert WidgetLayout (dashboard context type) ↔ PageWidgetLayout */
function toPageLayout(wl: WidgetLayout[]): PageWidgetLayout[] {
  return wl.map((item) => ({
    widgetId: item.widgetId,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
    autoH: item.autoH,
  }));
}

function toWidgetLayout(pl: PageWidgetLayout[]): WidgetLayout[] {
  return pl.map((item) => ({
    widgetId: item.widgetId,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
    autoH: item.autoH,
  }));
}

// ── Main Component ──────────────────────────────────────────────────────────

interface DashboardGridProps {
  widgets: Partial<Record<WidgetId, ReactNode>>;
  hiddenWidgets?: WidgetId[];
}

export function DashboardGrid({ widgets, hiddenWidgets = [] }: DashboardGridProps) {
  const {
    layout: savedLayout,
    reorderLayout,
    isLoading,
    heroCards,
    isEditMode,
    setIsEditMode,
    widgetReadiness,
    closedWidgets,
    closeWidget,
    openWidget,
  } = useDashboardIntelligence();

  const heroCount = heroCards.length || 4;

  const defaultLayoutLG = useMemo(
    () => [...generateHeroItems(heroCount, 12), ...NON_HERO_LAYOUT_LG],
    [heroCount]
  );
  const defaultLayoutSM = useMemo(
    () => [...generateHeroItems(heroCount, 6), ...NON_HERO_LAYOUT_SM],
    [heroCount]
  );

  const pageLayout = useMemo(() => toPageLayout(savedLayout), [savedLayout]);

  return (
    <PageGrid
      widgets={widgets as Record<string, ReactNode>}
      defaultLayoutLG={defaultLayoutLG}
      defaultLayoutSM={defaultLayoutSM}
      savedLayout={pageLayout}
      onLayoutChange={(layout) => reorderLayout(toWidgetLayout(layout))}
      closedWidgets={closedWidgets}
      onCloseWidget={closeWidget}
      onOpenWidget={openWidget}
      onReset={() => { reorderLayout([]); setIsEditMode(false); }}
      widgetReadiness={widgetReadiness}
      isLoading={isLoading}
      staticHiddenWidgets={hiddenWidgets}
      isEditMode={isEditMode}
      setIsEditMode={setIsEditMode}
    />
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
