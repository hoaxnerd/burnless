"use client";

/**
 * DashboardGrid — 2D drag-and-drop grid layout for the dashboard.
 * Uses react-grid-layout v2 for Metabase/Grafana-style grid snapping.
 * Each card is an independent grid item that can be placed anywhere.
 * Layout persists to dashboardPreferences.
 */

import {
  ResponsiveGridLayout,
  useContainerWidth,
  verticalCompactor,
  type LayoutItem,
} from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { GripVertical, Lock, RotateCcw, Unlock } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { useDashboardIntelligence, type WidgetLayout } from "./dashboard-intelligence-context";

// ── Widget ID type — individual cards, not sections ─────────────────────────

export type WidgetId =
  | "hero-0"
  | "hero-1"
  | "hero-2"
  | "hero-3"
  | "ai-command-center"
  | "weekly-digest"
  | "quick-actions"
  | "chart-cash"
  | "chart-rev-exp"
  | "chart-burn-runway"
  | "chart-mrr"
  | "scenarios"
  | "custom-metrics";

// ── Default layouts per breakpoint (12-column grid) ─────────────────────────

const ROW_HEIGHT = 30;
const GRID_MARGIN: [number, number] = [16, 16];
const GRID_COLS = { lg: 12, md: 12, sm: 6, xs: 6, xxs: 6 };

type RGLLayout = readonly LayoutItem[];

/** Default layout for lg (>=1200px) — 12 columns */
const DEFAULT_LAYOUT_LG: RGLLayout = [
  { i: "hero-0",            x: 0,  y: 0,  w: 3,  h: 5, minW: 2, minH: 4 },
  { i: "hero-1",            x: 3,  y: 0,  w: 3,  h: 5, minW: 2, minH: 4 },
  { i: "hero-2",            x: 6,  y: 0,  w: 3,  h: 5, minW: 2, minH: 4 },
  { i: "hero-3",            x: 9,  y: 0,  w: 3,  h: 5, minW: 2, minH: 4 },
  { i: "weekly-digest",     x: 0,  y: 5,  w: 12, h: 2, minW: 6, minH: 2 },
  { i: "ai-command-center", x: 0,  y: 7,  w: 12, h: 8, minW: 6, minH: 5 },
  { i: "quick-actions",     x: 0,  y: 15, w: 12, h: 5, minW: 6, minH: 3 },
  { i: "chart-cash",        x: 0,  y: 20, w: 6,  h: 10, minW: 4, minH: 7 },
  { i: "chart-rev-exp",     x: 6,  y: 20, w: 6,  h: 10, minW: 4, minH: 7 },
  { i: "chart-burn-runway", x: 0,  y: 30, w: 6,  h: 10, minW: 4, minH: 7 },
  { i: "chart-mrr",         x: 6,  y: 30, w: 6,  h: 10, minW: 4, minH: 7 },
  { i: "scenarios",         x: 0,  y: 40, w: 6,  h: 8, minW: 4, minH: 5 },
  { i: "custom-metrics",    x: 6,  y: 40, w: 6,  h: 8, minW: 4, minH: 5 },
];

/** Default layout for md (>=996px) */
const DEFAULT_LAYOUT_MD: RGLLayout = DEFAULT_LAYOUT_LG;

/** Default layout for sm/xs/xxs (mobile — 6 columns, stacked) */
const DEFAULT_LAYOUT_SM: RGLLayout = [
  { i: "hero-0",            x: 0, y: 0,  w: 3, h: 5, minW: 3, minH: 4 },
  { i: "hero-1",            x: 3, y: 0,  w: 3, h: 5, minW: 3, minH: 4 },
  { i: "hero-2",            x: 0, y: 5,  w: 3, h: 5, minW: 3, minH: 4 },
  { i: "hero-3",            x: 3, y: 5,  w: 3, h: 5, minW: 3, minH: 4 },
  { i: "weekly-digest",     x: 0, y: 10, w: 6, h: 2, minW: 6, minH: 2 },
  { i: "ai-command-center", x: 0, y: 12, w: 6, h: 8, minW: 6, minH: 5 },
  { i: "quick-actions",     x: 0, y: 20, w: 6, h: 5, minW: 6, minH: 3 },
  { i: "chart-cash",        x: 0, y: 25, w: 6, h: 10, minW: 6, minH: 7 },
  { i: "chart-rev-exp",     x: 0, y: 35, w: 6, h: 10, minW: 6, minH: 7 },
  { i: "chart-burn-runway", x: 0, y: 45, w: 6, h: 10, minW: 6, minH: 7 },
  { i: "chart-mrr",         x: 0, y: 55, w: 6, h: 10, minW: 6, minH: 7 },
  { i: "scenarios",         x: 0, y: 65, w: 6, h: 8, minW: 6, minH: 5 },
  { i: "custom-metrics",    x: 0, y: 73, w: 6, h: 8, minW: 6, minH: 5 },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Convert persisted WidgetLayout[] to react-grid-layout LayoutItem[] */
function savedToRGL(saved: WidgetLayout[], defaults: RGLLayout): LayoutItem[] {
  if (saved.length === 0) return [...defaults];

  const result: LayoutItem[] = [];
  const seen = new Set<string>();

  // Place saved items first
  for (const s of saved) {
    const def = defaults.find((d) => d.i === s.widgetId);
    result.push({
      i: s.widgetId,
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h,
      minW: def?.minW,
      minH: def?.minH,
    });
    seen.add(s.widgetId);
  }

  // Add any defaults not in saved (new widgets added after user saved)
  for (const d of defaults) {
    if (!seen.has(d.i)) {
      result.push({ ...d });
    }
  }

  return result;
}

/** Convert react-grid-layout Layout to our WidgetLayout[] for persistence */
function rglToSaved(rgl: RGLLayout): WidgetLayout[] {
  return rgl.map((item) => ({
    widgetId: item.i,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
  }));
}

// ── Main Grid Component ─────────────────────────────────────────────────────

interface DashboardGridProps {
  /** Map from widget ID to its rendered content */
  widgets: Partial<Record<WidgetId, ReactNode>>;
  /** Widget IDs that should be hidden (no data, etc.) */
  hiddenWidgets?: WidgetId[];
}

export function DashboardGrid({ widgets, hiddenWidgets = [] }: DashboardGridProps) {
  const { layout: savedLayout, reorderLayout, isLoading } = useDashboardIntelligence();
  const [isDragMode, setIsDragMode] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Width measurement for responsive grid
  const { width, containerRef } = useContainerWidth({ initialWidth: 1200 });

  // Filter out hidden widgets from the active set
  const hiddenSet = useMemo(() => new Set(hiddenWidgets), [hiddenWidgets]);
  const visibleWidgetIds = useMemo(
    () => Object.keys(widgets).filter((id) => !hiddenSet.has(id as WidgetId)) as WidgetId[],
    [widgets, hiddenSet]
  );

  // Build responsive layouts from saved preferences + defaults
  const layouts = useMemo(() => {
    const filterHidden = (items: LayoutItem[]) =>
      items.filter((item) => !hiddenSet.has(item.i as WidgetId) && item.i in (widgets as Record<string, unknown>));

    return {
      lg: filterHidden(savedToRGL(savedLayout, DEFAULT_LAYOUT_LG)),
      md: filterHidden(savedToRGL(savedLayout, DEFAULT_LAYOUT_MD)),
      sm: filterHidden(savedToRGL(savedLayout, DEFAULT_LAYOUT_SM)),
      xs: filterHidden(savedToRGL(savedLayout, DEFAULT_LAYOUT_SM)),
      xxs: filterHidden(savedToRGL(savedLayout, DEFAULT_LAYOUT_SM)),
    };
  }, [savedLayout, hiddenSet, widgets]);

  // Debounced save to avoid saving on every pixel of drag
  const handleLayoutChange = useCallback(
    (currentLayout: RGLLayout, _allLayouts: Partial<Record<string, RGLLayout>>) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        reorderLayout(rglToSaved(currentLayout));
      }, 500);
    },
    [reorderLayout]
  );

  const handleReset = useCallback(() => {
    reorderLayout([]);
    setIsDragMode(false);
  }, [reorderLayout]);

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-surface-50 animate-pulse h-36" />
        ))}
        <div className="col-span-2 lg:col-span-4 rounded-2xl bg-surface-50 animate-pulse h-48" />
        <div className="col-span-2 lg:col-span-4 rounded-2xl bg-surface-50 animate-pulse h-32" />
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      {/* Layout controls */}
      <div className="flex items-center justify-end gap-2 mb-4">
        <button
          onClick={() => setIsDragMode(!isDragMode)}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
            ${isDragMode
              ? "bg-brand-500 text-white hover:bg-brand-600"
              : "bg-surface-100 text-surface-500 hover:bg-surface-200 hover:text-surface-700"
            }
          `}
        >
          {isDragMode ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
          {isDragMode ? "Lock Layout" : "Edit Layout"}
        </button>
        {isDragMode && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-100 text-surface-500 hover:bg-surface-200 hover:text-surface-700 text-xs font-medium transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        )}
      </div>

      {/* Grid layout */}
      <ResponsiveGridLayout
        width={width}
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={GRID_COLS}
        rowHeight={ROW_HEIGHT}
        margin={GRID_MARGIN}
        containerPadding={[0, 0]}
        dragConfig={{ enabled: isDragMode, handle: ".grid-drag-handle" }}
        resizeConfig={{ enabled: isDragMode }}
        compactor={verticalCompactor}
        onLayoutChange={handleLayoutChange}
      >
        {visibleWidgetIds.map((id) => (
          <div key={id} className="relative">
            {/* Drag handle — visible in edit mode */}
            {isDragMode && (
              <div className="grid-drag-handle absolute -top-1 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-2 py-0.5 rounded-b-lg bg-surface-100/90 border border-t-0 border-surface-200 text-surface-400 hover:text-surface-600 cursor-grab active:cursor-grabbing transition-colors backdrop-blur-sm">
                <GripVertical className="h-3 w-3" />
                <span className="text-[10px] font-medium select-none">Drag</span>
              </div>
            )}
            {/* Edit mode border overlay */}
            {isDragMode && (
              <div className="absolute inset-0 rounded-2xl border-2 border-dashed border-brand-200/60 pointer-events-none z-20" />
            )}
            {/* Widget content */}
            <div className="h-full overflow-hidden">
              {widgets[id]}
            </div>
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  );
}

// Re-export defaults for use in page.tsx
export { DEFAULT_LAYOUT_LG };
