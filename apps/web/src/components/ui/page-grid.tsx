"use client";

/**
 * PageGrid — generic, order-driven fluid grid usable on any page.
 *
 * Layout model (see lib/widget-order.ts):
 * - Cards are arranged by a single persisted ORDER (+ a hidden set). Nothing
 *   screen-dependent is stored, so an arrangement made on any screen renders
 *   correctly on every screen.
 * - Each card speaks its own size: WIDTH comes from its declared span
 *   (defaultLayoutLG[i].w, out of 12) rendered via a fluid CSS grid that
 *   reflows by container width; HEIGHT is always content-driven (the card
 *   renders at its natural height — dynamic content included).
 * - There is no resize. Edit mode allows reordering (drag) and hide/show only.
 *
 * Widget lifecycle:
 * - Ready (default): shows content, can drag.
 * - Not Ready (widget reports no data): "Not Available" placeholder; in normal
 *   mode it is hidden entirely.
 * - Closed (user-hidden, persistent): hidden in normal mode; "Hidden"
 *   placeholder + red handle in edit mode.
 */

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eye, EyeOff, GripVertical, Lock, RotateCcw, Unlock } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { resolveOrder } from "@/lib/widget-order";

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * @deprecated Legacy coordinate layout shape. The grid no longer stores
 * positions/sizes — only widget order. Kept exported for backward-compatible
 * reads of older persisted data (see lib/widget-order.ts).
 */
export interface PageWidgetLayout {
  widgetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  autoH?: boolean;
}

export interface DefaultLayoutItem {
  /** Widget id */
  i: string;
  /** Declared column span out of 12 — the card's own width. */
  w: number;
  /** Legacy fields (ignored by the fluid grid; kept for call-site compat). */
  x?: number;
  h?: number;
  minW?: number;
  minH?: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Map a declared span (out of 12) to its fluid-grid width class. */
function spanClass(w: number | undefined): string {
  const v = w ?? 12;
  if (v >= 12) return "fluid-w-12";
  if (v >= 8) return "fluid-w-8";
  if (v >= 6) return "fluid-w-6";
  if (v >= 4) return "fluid-w-4";
  return "fluid-w-3";
}

// ── Placeholder components ──────────────────────────────────────────────────

function NotAvailablePlaceholder() {
  return (
    <div className="min-h-32 h-full rounded-2xl border border-dashed border-surface-200 bg-surface-50/50 flex items-center justify-center">
      <p className="text-sm text-surface-400 font-medium">Not Available</p>
    </div>
  );
}

function HiddenPlaceholder() {
  return (
    <div className="min-h-32 h-full rounded-2xl border-2 border-dashed border-red-300 bg-red-50/30 flex items-center justify-center">
      <p className="text-sm text-red-400 font-medium">Hidden</p>
    </div>
  );
}

// ── Sortable card ───────────────────────────────────────────────────────────

function SortableCard({
  id,
  widthClass,
  isEditMode,
  isClosed,
  isReady,
  onCloseWidget,
  onOpenWidget,
  children,
}: {
  id: string;
  widthClass: string;
  isEditMode: boolean;
  isClosed: boolean;
  isReady: boolean;
  onCloseWidget?: (id: string) => void;
  onOpenWidget?: (id: string) => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: !isEditMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 40 : undefined,
  };

  const showContent = isReady && !isClosed;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative ${widthClass}`}
      {...(isEditMode ? { "data-editing": "" } : {})}
      {...(isClosed && isEditMode ? { "data-widget-closed": "" } : {})}
    >
      {/* Drag handle — visible in edit mode; drag starts from here only */}
      {isEditMode && (
        <div
          className={`absolute -top-1 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-2 py-0.5 rounded-b-lg border border-t-0 transition-colors backdrop-blur-sm ${
            isClosed
              ? "bg-red-50/90 border-red-200 text-red-400 hover:text-red-600"
              : "bg-surface-100/90 border-surface-200 text-surface-400 hover:text-surface-600"
          }`}
        >
          <button
            type="button"
            className="flex items-center gap-1 cursor-grab active:cursor-grabbing"
            aria-label={`Reorder ${id}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3 w-3" />
            <span className="text-[10px] font-medium select-none">
              {isClosed ? "Hidden" : "Drag"}
            </span>
          </button>
          {/* Close / Open toggle */}
          {isClosed ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenWidget?.(id);
              }}
              className="ml-1 p-0.5 rounded hover:bg-red-100 transition-colors"
              title="Show widget"
            >
              <Eye className="h-3 w-3" />
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCloseWidget?.(id);
              }}
              className="ml-1 p-0.5 rounded hover:bg-surface-200 transition-colors"
              title="Hide widget"
            >
              <EyeOff className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* Content wrapper — keeps the widget mounted (hidden) so it can still
          report readiness while a placeholder is shown over it. */}
      <div className="widget-content">
        <div className={showContent ? "" : "hidden"}>{children}</div>
        {isClosed && isEditMode && <HiddenPlaceholder />}
        {!isClosed && !isReady && <NotAvailablePlaceholder />}
      </div>
    </div>
  );
}

// ── Main Grid Component ─────────────────────────────────────────────────────

export interface PageGridProps {
  /** Widget map: { widgetId: ReactNode } */
  widgets: Record<string, ReactNode>;
  /** Default layout items — provides default ORDER (array order) + declared width (`w`). */
  defaultLayoutLG: DefaultLayoutItem[];
  /** @deprecated No longer used (single fluid layout). Kept for call-site compat. */
  defaultLayoutSM?: DefaultLayoutItem[];
  /** Persisted widget order from preferences */
  order?: string[];
  /** Called when the user reorders widgets (drag) */
  onReorder?: (order: string[]) => void;
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
  order = [],
  onReorder,
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
  // Edit mode: external control if provided, otherwise internal state.
  const [internalEditMode, setInternalEditMode] = useState(false);
  const isEditMode = externalEditMode ?? internalEditMode;
  const setIsEditMode = externalSetEditMode ?? setInternalEditMode;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const closedSet = useMemo(() => new Set(closedWidgets), [closedWidgets]);
  const staticHiddenSet = useMemo(
    () => new Set(staticHiddenWidgets),
    [staticHiddenWidgets]
  );

  // Declared width (span) per widget id, from the default layout.
  const widthClassById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of defaultLayoutLG) map[item.i] = spanClass(item.w);
    return map;
  }, [defaultLayoutLG]);

  const defaultOrder = useMemo(
    () => defaultLayoutLG.map((d) => d.i),
    [defaultLayoutLG]
  );

  // Canonical sequence of user-managed widgets (excludes always-hidden ones).
  // This is what edit mode renders and what gets persisted on reorder, so a
  // closed/not-ready widget keeps its position when reopened.
  const fullOrder = useMemo(() => {
    const available = Object.keys(widgets).filter((id) => !staticHiddenSet.has(id));
    return resolveOrder(order, defaultOrder, available);
  }, [order, defaultOrder, widgets, staticHiddenSet]);

  // What actually renders: edit mode shows everything; normal mode hides
  // closed + not-ready widgets.
  const renderIds = useMemo(() => {
    if (isEditMode) return fullOrder;
    return fullOrder.filter(
      (id) => !closedSet.has(id) && widgetReadiness[id] !== false
    );
  }, [fullOrder, isEditMode, closedSet, widgetReadiness]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = fullOrder.indexOf(String(active.id));
      const newIndex = fullOrder.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      onReorder?.(arrayMove(fullOrder, oldIndex, newIndex));
    },
    [fullOrder, onReorder]
  );

  const handleReset = useCallback(() => {
    onReset?.();
    setIsEditMode(false);
  }, [onReset, setIsEditMode]);

  if (isLoading) {
    return (
      <div className="page-fluid-container">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-surface-50 animate-pulse h-36" />
          ))}
          <div className="col-span-2 lg:col-span-4 rounded-2xl bg-surface-50 animate-pulse h-48" />
        </div>
      </div>
    );
  }

  return (
    <div className="page-fluid-container">
      {/* Layout controls */}
      <div className="flex items-center justify-end gap-2 mb-4">
        <button
          type="button"
          onClick={() => setIsEditMode(!isEditMode)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            isEditMode
              ? "bg-brand-500 text-white hover:bg-brand-600"
              : "bg-surface-100 text-surface-500 hover:bg-surface-200 hover:text-surface-700"
          }`}
        >
          {isEditMode ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
          {isEditMode ? "Lock Layout" : "Edit Layout"}
        </button>
        {isEditMode && (
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-100 text-surface-500 hover:bg-surface-200 hover:text-surface-700 text-xs font-medium transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        )}
      </div>

      {/* Fluid, order-driven grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={renderIds} strategy={rectSortingStrategy}>
          <div className="page-fluid-grid">
            {renderIds.map((id) => (
              <SortableCard
                key={id}
                id={id}
                widthClass={widthClassById[id] ?? "fluid-w-12"}
                isEditMode={isEditMode}
                isClosed={closedSet.has(id)}
                isReady={widgetReadiness[id] !== false}
                onCloseWidget={onCloseWidget}
                onOpenWidget={onOpenWidget}
              >
                {widgets[id]}
              </SortableCard>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
