"use client";

/**
 * PageGrid — generic 2D drag-and-drop grid layout usable on any page.
 *
 * Extracted from the dashboard-specific DashboardGrid to provide layout
 * editing (drag, resize, show/hide, persist) on every page.
 *
 * Widget lifecycle:
 * - Ready (default): shows content, can drag + resize
 * - Not Ready (widget reports no data): shows "Not Available", can drag, no resize
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

// ── Types ────────────────────────────────────────────────────────────────────

export interface PageWidgetLayout {
  widgetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** true (default) = content-driven height; false = user-locked via resize */
  autoH?: boolean;
}

export interface DefaultLayoutItem {
  /** Widget id */
  i: string;
  x: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

type RGLLayout = readonly LayoutItem[];

// ── Grid constants ──────────────────────────────────────────────────────────

const ROW_HEIGHT = 30;
const GRID_MARGIN: [number, number] = [16, 16];
const GRID_COLS = { lg: 12, md: 12, sm: 6, xs: 6, xxs: 6 };

// ── Helpers ─────────────────────────────────────────────────────────────────

function assignYPositions(items: DefaultLayoutItem[]): LayoutItem[] {
  const result: LayoutItem[] = [];
  let yOffset = 0;
  for (const item of items) {
    result.push({ ...item, y: yOffset } as LayoutItem);
    if (item.x === 0) yOffset += item.h;
  }
  return result;
}

function savedToRGL(saved: PageWidgetLayout[], defaults: RGLLayout): LayoutItem[] {
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

function rglToSaved(rgl: RGLLayout, existingSaved: PageWidgetLayout[]): PageWidgetLayout[] {
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

function isAutoHeight(widgetId: string, savedLayout: PageWidgetLayout[]): boolean {
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

export interface PageGridProps {
  /** Widget map: { widgetId: ReactNode } */
  widgets: Record<string, ReactNode>;
  /** Default layout items for large screens */
  defaultLayoutLG: DefaultLayoutItem[];
  /** Default layout items for small screens (optional, falls back to LG) */
  defaultLayoutSM?: DefaultLayoutItem[];
  /** Persisted layout from preferences */
  savedLayout?: PageWidgetLayout[];
  /** Called when layout changes (drag/resize) */
  onLayoutChange?: (layout: PageWidgetLayout[]) => void;
  /** Widget IDs the user has explicitly closed */
  closedWidgets?: string[];
  /** Called when a widget is closed */
  onCloseWidget?: (id: string) => void;
  /** Called when a closed widget is reopened */
  onOpenWidget?: (id: string) => void;
  /** Called when layout is reset to defaults */
  onReset?: () => void;
  /** Widget readiness state — false means not ready, undefined/true means ready */
  widgetReadiness?: Record<string, boolean>;
  /** Widget reports it has data */
  reportWidgetReady?: (id: string) => void;
  /** Widget reports it has no data */
  reportWidgetNotReady?: (id: string) => void;
  /** Whether preferences are still loading */
  isLoading?: boolean;
  /** Widget IDs that are always hidden (not toggleable) */
  staticHiddenWidgets?: string[];
  /** External edit mode control (optional — uses internal state if not provided) */
  isEditMode?: boolean;
  /** External edit mode setter */
  setIsEditMode?: (editing: boolean) => void;
}

export function PageGrid({
  widgets,
  defaultLayoutLG,
  defaultLayoutSM,
  savedLayout = [],
  onLayoutChange,
  closedWidgets = [],
  onCloseWidget,
  onOpenWidget,
  onReset,
  widgetReadiness = {},
  isLoading = false,
  staticHiddenWidgets = [],
  isEditMode: externalEditMode,
  setIsEditMode: externalSetEditMode,
}: PageGridProps) {
  // Edit mode: use external control if provided, otherwise manage internally
  const [internalEditMode, setInternalEditMode] = useState(false);
  const isEditMode = externalEditMode ?? internalEditMode;
  const setIsEditMode = externalSetEditMode ?? setInternalEditMode;

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
  const staticHiddenSet = useMemo(() => new Set(staticHiddenWidgets), [staticHiddenWidgets]);

  // All widget IDs from the widgets prop
  const allWidgetIds = useMemo(
    () => Object.keys(widgets),
    [widgets]
  );

  // Visible widget IDs: in edit mode show ALL, in normal mode hide closed + not-ready
  const visibleWidgetIds = useMemo(() => {
    if (isEditMode) {
      return allWidgetIds.filter((id) => !staticHiddenSet.has(id));
    }
    return allWidgetIds.filter((id) => {
      if (staticHiddenSet.has(id) || closedSet.has(id)) return false;
      if (widgetReadiness[id] === false) return false;
      return true;
    });
  }, [allWidgetIds, isEditMode, closedSet, staticHiddenSet, widgetReadiness]);

  // Build default layouts with y positions
  const defaultLG = useMemo(() => assignYPositions(defaultLayoutLG), [defaultLayoutLG]);
  const defaultSM = useMemo(
    () => assignYPositions(defaultLayoutSM ?? defaultLayoutLG.map((item) => ({
      ...item,
      x: 0,
      w: 6,
    }))),
    [defaultLayoutSM, defaultLayoutLG]
  );

  // Build layouts
  const baseLayouts = useMemo(() => {
    const visibleSet = new Set(visibleWidgetIds);
    const filterVisible = (items: LayoutItem[]) =>
      items.filter((item) => visibleSet.has(item.i) && item.i in widgets);

    return {
      lg: filterVisible(savedToRGL(savedLayout, defaultLG)),
      md: filterVisible(savedToRGL(savedLayout, defaultLG)),
      sm: filterVisible(savedToRGL(savedLayout, defaultSM)),
      xs: filterVisible(savedToRGL(savedLayout, defaultSM)),
      xxs: filterVisible(savedToRGL(savedLayout, defaultSM)),
    };
  }, [savedLayout, visibleWidgetIds, widgets, defaultLG, defaultSM]);

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
      onLayoutChange?.(rglToSaved(layout, savedLayout));
    },
    [onLayoutChange, savedLayout]
  );

  // Save on resize stop — lock the resized widget's height
  const handleResizeStop = useCallback(
    (layout: RGLLayout, _oldItem: LayoutItem | null, newItem: LayoutItem | null) => {
      if (!newItem) return;
      const saved = rglToSaved(layout, savedLayout).map((item) =>
        item.widgetId === newItem.i ? { ...item, autoH: false as const } : item
      );
      onLayoutChange?.(saved);
      setAutoHeights((prev) => {
        if (!(newItem.i in prev)) return prev;
        const next = { ...prev };
        delete next[newItem.i];
        return next;
      });
    },
    [onLayoutChange, savedLayout]
  );

  const handleReset = useCallback(() => {
    onReset?.();
    setAutoHeights({});
    setIsEditMode(false);
  }, [onReset, setIsEditMode]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-surface-50 animate-pulse h-36" />
        ))}
        <div className="col-span-2 lg:col-span-4 rounded-2xl bg-surface-50 animate-pulse h-48" />
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
          const isReady = widgetReadiness[id] !== false;
          const isClosed = closedSet.has(id);
          const isAuto = isAutoHeight(id, savedLayout);
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
                      onClick={(e) => { e.stopPropagation(); onOpenWidget?.(id); }}
                      className="ml-1 p-0.5 rounded hover:bg-red-100 transition-colors"
                      title="Show widget"
                    >
                      <Eye className="h-3 w-3" />
                    </button>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); onCloseWidget?.(id); }}
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
                <div className={showContent ? "" : "hidden"}>
                  {widgets[id]}
                </div>
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
