"use client";

/**
 * DashboardGrid — drag-and-drop sortable dashboard layout.
 * Uses @dnd-kit/sortable to let users rearrange widgets.
 * Layout order is persisted to dashboardPreferences.
 */

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, RotateCcw } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useDashboardIntelligence, type WidgetLayout } from "./dashboard-intelligence-context";

// ── Widget definitions ────────────────────────────────────────────────────────

export type WidgetId =
  | "hero-kpis"
  | "ai-command-center"
  | "weekly-digest"
  | "quick-actions"
  | "charts"
  | "bottom-section";

/** Default widget order — matches the current static layout */
export const DEFAULT_WIDGET_ORDER: WidgetId[] = [
  "weekly-digest",
  "ai-command-center",
  "hero-kpis",
  "quick-actions",
  "charts",
  "bottom-section",
];

// ── Sortable Widget Wrapper ───────────────────────────────────────────────────

function SortableWidget({
  id,
  children,
  isDragMode,
}: {
  id: string;
  children: ReactNode;
  isDragMode: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative" as const,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {isDragMode && (
        <button
          {...attributes}
          {...listeners}
          className="absolute -left-2 top-1/2 -translate-y-1/2 z-30 p-1.5 rounded-lg bg-surface-0 border border-surface-200 shadow-sm text-surface-400 hover:text-surface-600 hover:bg-surface-50 cursor-grab active:cursor-grabbing transition-colors"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      {isDragMode && (
        <div className="absolute inset-0 rounded-2xl border-2 border-dashed border-brand-200 pointer-events-none z-20" />
      )}
      {children}
    </div>
  );
}

// ── Main Grid Component ───────────────────────────────────────────────────────

interface DashboardGridProps {
  /** Map from widget ID to its rendered content */
  widgets: Record<WidgetId, ReactNode>;
  /** Widget IDs that should be hidden (no data, etc.) */
  hiddenWidgets?: WidgetId[];
}

export function DashboardGrid({ widgets, hiddenWidgets = [] }: DashboardGridProps) {
  const { layout, reorderLayout } = useDashboardIntelligence();
  const [isDragMode, setIsDragMode] = useState(false);

  // Compute effective widget order from saved layout or defaults
  const widgetOrder = useMemo(() => {
    if (layout.length > 0) {
      // Use saved order, adding any new widgets that might not be in the saved layout
      const savedOrder = layout.map((l) => l.widgetId as WidgetId);
      const missing = DEFAULT_WIDGET_ORDER.filter((id) => !savedOrder.includes(id));
      return [...savedOrder, ...missing].filter(
        (id) => !hiddenWidgets.includes(id) && id in widgets
      );
    }
    return DEFAULT_WIDGET_ORDER.filter(
      (id) => !hiddenWidgets.includes(id) && id in widgets
    );
  }, [layout, hiddenWidgets, widgets]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = widgetOrder.indexOf(active.id as WidgetId);
      const newIndex = widgetOrder.indexOf(over.id as WidgetId);
      if (oldIndex === -1 || newIndex === -1) return;

      const newOrder = [...widgetOrder];
      newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, active.id as WidgetId);

      reorderLayout(
        newOrder.map((id) => ({
          widgetId: id,
          w: 12,
          h: 1,
        }))
      );
    },
    [widgetOrder, reorderLayout]
  );

  const handleReset = useCallback(() => {
    reorderLayout([]);
    setIsDragMode(false);
  }, [reorderLayout]);

  return (
    <div>
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
          <GripVertical className="h-3 w-3" />
          {isDragMode ? "Done" : "Rearrange"}
        </button>
        {isDragMode && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-100 text-surface-500 hover:bg-surface-200 hover:text-surface-700 text-xs font-medium transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Reset Layout
          </button>
        )}
      </div>

      {/* Sortable grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={widgetOrder}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-6 sm:space-y-8">
            {widgetOrder.map((id) => (
              <SortableWidget key={id} id={id} isDragMode={isDragMode}>
                {widgets[id]}
              </SortableWidget>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
