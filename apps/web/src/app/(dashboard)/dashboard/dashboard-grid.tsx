"use client";

/**
 * DashboardGrid — 2D drag-and-drop grid layout for the dashboard.
 *
 * Widget lifecycle:
 * - Not Ready (widget reports no data): shows "Not Available", can drag, no resize
 * - Ready + Open: shows content, can drag + resize
 * - Closed (user-hidden, persistent): hidden in normal mode; red "Hidden" in edit mode
 *
 * Height modes:
 * - Auto (default): content drives height via ResizeObserver
 * - Locked (user-resized): fixed height with scrolling
 */

import {
  ResponsiveGridLayout,
  useContainerWidth,
  verticalCompactor,
  type LayoutItem,
} from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import {
  Eye,
  EyeOff,
  GripVertical,
  Lock,
  RotateCcw,
  Unlock,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

// ── Grid constants ──────────────────────────────────────────────────────────

const ROW_HEIGHT = 30;
const GRID_MARGIN: [number, number] = [16, 16];
const GRID_COLS = { lg: 12, md: 12, sm: 6, xs: 6, xxs: 6 };

type RGLLayout = readonly LayoutItem[];

// ── Default layouts ─────────────────────────────────────────────────────────

const NON_HERO_LAYOUT_LG: readonly Omit<LayoutItem, "y">[] = [
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

const NON_HERO_LAYOUT_SM: readonly Omit<LayoutItem, "y">[] = [
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

function generateDefaultLayout(
  heroCount: number,
  cols: number,
  nonHeroItems: readonly Omit<LayoutItem, "y">[],
): LayoutItem[] {
  const heroH = 5;
  const perRow = cols === 12 ? 4 : 2;
  const heroW = cols === 12 ? 3 : 3;
  const minW = cols === 12 ? 2 : 3;
  const items: LayoutItem[] = [];

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
    items.push({ ...item, y: yOffset } as LayoutItem);
    if (item.x === 0) yOffset += item.h;
  }

  return items;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function savedToRGL(saved: WidgetLayout[], defaults: RGLLayout): LayoutItem[] {
  if (saved.length === 0) return [...defaults];

  const result: LayoutItem[] = [];
  const seen = new Set<string>();

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

  for (const d of defaults) {
    if (!seen.has(d.i)) {
      result.push({ ...d });
    }
  }

  return result;
}

function rglToSaved(rgl: RGLLayout, existingSaved: WidgetLayout[]): WidgetLayout[] {
  return rgl.map((item) => {
    const existing = existingSaved.find((s) => s.widgetId === item.i);
    return {
      widgetId: item.i,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      autoH: existing?.autoH,
    };
  });
}

function isAutoHeight(widgetId: string, savedLayout: WidgetLayout[]): boolean {
  const saved = savedLayout.find((s) => s.widgetId === widgetId);
  return !saved || saved.autoH !== false;
}

function pxToGridH(px: number): number {
  return Math.max(Math.ceil((px + GRID_MARGIN[1]) / (ROW_HEIGHT + GRID_MARGIN[1])), 1);
}

// ── Auto-height widget wrapper ──────────────────────────────────────────────

function WidgetWrapper({
  widgetId,
  autoHeight,
  onMeasure,
  children,
}: {
  widgetId: string;
  autoHeight: boolean;
  onMeasure: (widgetId: string, gridH: number) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoHeight || !ref.current) return;
    const el = ref.current;
    let rafId: number;

    const measure = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!el) return;
        const gridH = pxToGridH(el.offsetHeight);
        onMeasure(widgetId, gridH);
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [widgetId, autoHeight, onMeasure]);

  return (
    <div
      ref={ref}
      className={`widget-content ${autoHeight ? "" : "h-full overflow-y-auto"}`}
    >
      {children}
    </div>
  );
}

// ── Placeholder components ──────────────────────────────────────────────────

function NotAvailablePlaceholder() {
  return (
    <div className="h-full rounded-2xl border border-dashed border-surface-200 bg-surface-50/50 flex items-center justify-center">
      <p className="text-sm text-surface-400 font-medium">Not Available</p>
    </div>
  );
}

function HiddenPlaceholder() {
  return (
    <div className="h-full rounded-2xl border-2 border-dashed border-red-300 bg-red-50/30 flex items-center justify-center">
      <p className="text-sm text-red-400 font-medium">Hidden</p>
    </div>
  );
}

// ── Main Grid Component ─────────────────────────────────────────────────────

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

  // Auto-height measurements (transient)
  const [autoHeights, setAutoHeights] = useState<Record<string, number>>({});
  const handleAutoMeasure = useCallback((widgetId: string, gridH: number) => {
    setAutoHeights((prev) => {
      if (prev[widgetId] === gridH) return prev;
      return { ...prev, [widgetId]: gridH };
    });
  }, []);

  const { width, containerRef } = useContainerWidth({ initialWidth: 1200 });

  const closedSet = useMemo(() => new Set(closedWidgets), [closedWidgets]);
  const staticHiddenSet = useMemo(() => new Set(hiddenWidgets as string[]), [hiddenWidgets]);

  // All widget IDs from the widgets prop
  const allWidgetIds = useMemo(
    () => Object.keys(widgets) as WidgetId[],
    [widgets]
  );

  // Visible widget IDs: in edit mode show ALL, in normal mode hide closed + not-ready
  const visibleWidgetIds = useMemo(() => {
    if (isEditMode) {
      // Edit mode: show everything except static hidden
      return allWidgetIds.filter((id) => !staticHiddenSet.has(id));
    }
    // Normal mode: hide closed, not-ready, and static hidden
    return allWidgetIds.filter((id) => {
      if (staticHiddenSet.has(id) || closedSet.has(id)) return false;
      // widgetReadiness[id] === false means explicitly not ready; undefined = ready (default)
      if (widgetReadiness[id] === false) return false;
      return true;
    });
  }, [allWidgetIds, isEditMode, closedSet, staticHiddenSet, widgetReadiness]);

  // Build layouts — include ALL widgets (for edit mode), filter for current view
  const baseLayouts = useMemo(() => {
    const hc = heroCards.length || 4;
    const defaultLG = generateDefaultLayout(hc, 12, NON_HERO_LAYOUT_LG);
    const defaultSM = generateDefaultLayout(hc, 6, NON_HERO_LAYOUT_SM);

    const visibleSet = new Set(visibleWidgetIds as string[]);
    const filterVisible = (items: LayoutItem[]) =>
      items.filter((item) => visibleSet.has(item.i) && item.i in (widgets as Record<string, unknown>));

    return {
      lg: filterVisible(savedToRGL(savedLayout, defaultLG)),
      md: filterVisible(savedToRGL(savedLayout, defaultLG)),
      sm: filterVisible(savedToRGL(savedLayout, defaultSM)),
      xs: filterVisible(savedToRGL(savedLayout, defaultSM)),
      xxs: filterVisible(savedToRGL(savedLayout, defaultSM)),
    };
  }, [savedLayout, visibleWidgetIds, widgets, heroCards.length]);

  // Apply auto-heights + per-item resize control
  const layouts = useMemo(() => {
    const enhance = (items: LayoutItem[]) =>
      items.map((item) => {
        const isAuto = isAutoHeight(item.i, savedLayout);
        const measuredH = autoHeights[item.i];
        const isReady = widgetReadiness[item.i] !== false;
        const isClosed = closedSet.has(item.i);

        let h = item.h;
        if (isAuto && measuredH !== undefined) {
          h = Math.max(measuredH, item.minH ?? 1);
        }

        return {
          ...item,
          h,
          // Ready or closed → can resize. Not ready → no resize.
          isResizable: isReady || isClosed,
        };
      });

    return {
      lg: enhance(baseLayouts.lg),
      md: enhance(baseLayouts.md),
      sm: enhance(baseLayouts.sm),
      xs: enhance(baseLayouts.xs),
      xxs: enhance(baseLayouts.xxs),
    };
  }, [baseLayouts, autoHeights, savedLayout, widgetReadiness, closedSet]);

  // Save on drag stop
  const handleDragStop = useCallback(
    (layout: RGLLayout) => {
      reorderLayout(rglToSaved(layout, savedLayout));
    },
    [reorderLayout, savedLayout]
  );

  // Save on resize stop — lock the resized widget's height
  const handleResizeStop = useCallback(
    (layout: RGLLayout, _oldItem: LayoutItem | null, newItem: LayoutItem | null) => {
      if (!newItem) return;
      const saved = rglToSaved(layout, savedLayout).map((item) =>
        item.widgetId === newItem.i ? { ...item, autoH: false as const } : item
      );
      reorderLayout(saved);
      setAutoHeights((prev) => {
        if (!(newItem.i in prev)) return prev;
        const next = { ...prev };
        delete next[newItem.i];
        return next;
      });
    },
    [reorderLayout, savedLayout]
  );

  const handleReset = useCallback(() => {
    reorderLayout([]);
    setAutoHeights({});
    setIsEditMode(false);
  }, [reorderLayout, setIsEditMode]);

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
          onClick={() => setIsEditMode(!isEditMode)}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
            ${isEditMode
              ? "bg-brand-500 text-white hover:bg-brand-600"
              : "bg-surface-100 text-surface-500 hover:bg-surface-200 hover:text-surface-700"
            }
          `}
        >
          {isEditMode ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
          {isEditMode ? "Lock Layout" : "Edit Layout"}
        </button>
        {isEditMode && (
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
        dragConfig={{ enabled: isEditMode, handle: ".grid-drag-handle" }}
        resizeConfig={{ enabled: isEditMode }}
        compactor={verticalCompactor}
        onDragStop={handleDragStop}
        onResizeStop={handleResizeStop}
      >
        {visibleWidgetIds.map((id) => {
          const isReady = widgetReadiness[id] !== false; // undefined = ready (default)
          const isClosed = closedSet.has(id);
          const isAuto = isAutoHeight(id, savedLayout);

          // What content to show
          const showContent = isReady && !isClosed;

          return (
            <div
              key={id}
              className="relative"
              {...(isEditMode ? { "data-editing": "" } : {})}
              {...(isClosed && isEditMode ? { "data-widget-closed": "" } : {})}
            >
              {/* Drag handle — visible in edit mode */}
              {isEditMode && (
                <div className={`grid-drag-handle absolute -top-1 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-2 py-0.5 rounded-b-lg border border-t-0 cursor-grab active:cursor-grabbing transition-colors backdrop-blur-sm ${
                  isClosed
                    ? "bg-red-50/90 border-red-200 text-red-400 hover:text-red-600"
                    : "bg-surface-100/90 border-surface-200 text-surface-400 hover:text-surface-600"
                }`}>
                  <GripVertical className="h-3 w-3" />
                  <span className="text-[10px] font-medium select-none">
                    {isClosed ? "Hidden" : "Drag"}
                  </span>
                  {/* Close / Open toggle */}
                  {isClosed ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); openWidget(id); }}
                      className="ml-1 p-0.5 rounded hover:bg-red-100 transition-colors"
                      title="Show widget"
                    >
                      <Eye className="h-3 w-3" />
                    </button>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); closeWidget(id); }}
                      className="ml-1 p-0.5 rounded hover:bg-surface-200 transition-colors"
                      title="Hide widget"
                    >
                      <EyeOff className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}

              {/* Widget content wrapper with auto-height measurement */}
              <WidgetWrapper
                widgetId={id}
                autoHeight={showContent && isAuto}
                onMeasure={handleAutoMeasure}
              >
                {/* Always mount widget so it can report readiness */}
                <div className={showContent ? "" : "hidden"}>
                  {widgets[id]}
                </div>
                {/* Placeholders */}
                {isClosed && isEditMode && <HiddenPlaceholder />}
                {!isClosed && !isReady && <NotAvailablePlaceholder />}
              </WidgetWrapper>
            </div>
          );
        })}
      </ResponsiveGridLayout>
    </div>
  );
}

export { generateDefaultLayout };
