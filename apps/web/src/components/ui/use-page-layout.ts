"use client";

/**
 * usePageLayout — manages per-page layout persistence for PageGrid.
 *
 * Reads initial layout from server-provided preferences (pageLayouts[pageId]),
 * provides state and callbacks that PageGrid needs, and persists changes
 * via the dashboard-preferences API.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { PageWidgetLayout } from "./page-grid";

interface PageLayoutData {
  layout: PageWidgetLayout[];
  closedWidgets: string[];
}

interface UsePageLayoutOptions {
  /** Unique page identifier (e.g., "expenses", "revenue", "runway") */
  pageId: string;
  /** Initial page layout from server-side load (avoids loading flash) */
  initialData?: PageLayoutData | null;
}

interface UsePageLayoutReturn {
  /** Persisted layout for this page */
  savedLayout: PageWidgetLayout[];
  /** Called when layout changes (drag/resize) */
  onLayoutChange: (layout: PageWidgetLayout[]) => void;
  /** Widget IDs the user has closed on this page */
  closedWidgets: string[];
  /** Close a widget */
  onCloseWidget: (id: string) => void;
  /** Reopen a widget */
  onOpenWidget: (id: string) => void;
  /** Reset layout to defaults */
  onReset: () => void;
  /** Whether layout data is loading */
  isLoading: boolean;
}

export function usePageLayout({
  pageId,
  initialData,
}: UsePageLayoutOptions): UsePageLayoutReturn {
  const [isLoading, setIsLoading] = useState(!initialData);
  const [layout, setLayout] = useState<PageWidgetLayout[]>(initialData?.layout ?? []);
  const [closedWidgets, setClosedWidgets] = useState<string[]>(initialData?.closedWidgets ?? []);

  // Load from API if no initial data provided
  const loadedRef = useRef(false);
  useEffect(() => {
    if (initialData || loadedRef.current) return;
    loadedRef.current = true;
    fetch("/api/dashboard-preferences")
      .then((r) => r.json())
      .then((data) => {
        const pageData = data.pageLayouts?.[pageId];
        if (pageData) {
          setLayout(pageData.layout ?? []);
          setClosedWidgets(pageData.closedWidgets ?? []);
        }
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [initialData, pageId]);

  // Persist to API
  const saveRef = useRef<Promise<void> | null>(null);
  const save = useCallback(
    (nextLayout: PageWidgetLayout[], nextClosed: string[]) => {
      const body = JSON.stringify({
        pageLayouts: {
          [pageId]: {
            layout: nextLayout,
            closedWidgets: nextClosed,
          },
        },
      });
      const promise = fetch("/api/dashboard-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      })
        .then(() => {})
        .catch((err) => console.error(`Failed to save ${pageId} layout:`, err))
        .finally(() => { saveRef.current = null; });
      saveRef.current = promise;
    },
    [pageId]
  );

  const onLayoutChange = useCallback(
    (nextLayout: PageWidgetLayout[]) => {
      setLayout(nextLayout);
      save(nextLayout, closedWidgets);
    },
    [save, closedWidgets]
  );

  const onCloseWidget = useCallback(
    (id: string) => {
      setClosedWidgets((prev) => {
        if (prev.includes(id)) return prev;
        const next = [...prev, id];
        save(layout, next);
        return next;
      });
    },
    [save, layout]
  );

  const onOpenWidget = useCallback(
    (id: string) => {
      setClosedWidgets((prev) => {
        const next = prev.filter((w) => w !== id);
        save(layout, next);
        return next;
      });
    },
    [save, layout]
  );

  const onReset = useCallback(() => {
    setLayout([]);
    setClosedWidgets([]);
    save([], []);
  }, [save]);

  return {
    savedLayout: layout,
    onLayoutChange,
    closedWidgets,
    onCloseWidget,
    onOpenWidget,
    onReset,
    isLoading,
  };
}
