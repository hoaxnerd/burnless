"use client";

/**
 * PageLayoutProvider — universal per-page layout persistence context.
 *
 * Replaces both DashboardLayoutContext (for layout concerns) and the
 * usePageLayout hook. Every page uses this instead of wiring layout
 * management independently.
 *
 * Manages per-page:
 * - order + onReorder — widget order (screen-independent; no positions/sizes)
 * - closedWidgets + onCloseWidget/onOpenWidget — user-hidden widgets
 * - widgetReadiness + reportWidgetReady/reportWidgetNotReady — widget data state
 * - isEditMode + setIsEditMode — reorder/hide mode toggle
 * - isLoading / isSaving — loading states
 *
 * Persistence format (merged into dashboard-preferences API):
 * { pageLayouts: { [pageId]: { order: [...], closedWidgets: [...] } } }
 * Legacy rows storing a coordinate `layout` are read via deriveWidgetOrder().
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api-fetch";
import { deriveWidgetOrder } from "@/lib/widget-order";
import { useInitialLayouts } from "./initial-layouts-context";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PageLayoutState {
  order: string[];
  onReorder: (order: string[]) => void;
  closedWidgets: string[];
  onCloseWidget: (id: string) => void;
  onOpenWidget: (id: string) => void;
  onReset: () => void;
  isLoading: boolean;
  isSaving: boolean;
  isEditMode: boolean;
  setIsEditMode: (editing: boolean) => void;
  widgetReadiness: Record<string, boolean>;
  reportWidgetReady: (id: string) => void;
  reportWidgetNotReady: (id: string) => void;
}

// ── Context ──────────────────────────────────────────────────────────────────

const PageLayoutCtx = createContext<PageLayoutState | null>(null);

export function usePageLayoutContext(): PageLayoutState {
  const ctx = useContext(PageLayoutCtx);
  if (!ctx) throw new Error("usePageLayoutContext must be used within PageLayoutProvider");
  return ctx;
}

/** Optional version — returns null when outside provider. */
export function useOptionalPageLayout(): PageLayoutState | null {
  return useContext(PageLayoutCtx);
}

// ── Provider ─────────────────────────────────────────────────────────────────

interface PageLayoutProviderProps {
  children: ReactNode;
  /** Unique page identifier (e.g. "expenses", "revenue", "runway") */
  pageId: string;
  /** Server-side initial widget order (avoids loading flash) */
  initialOrder?: string[];
  /** Server-side initial closed widgets (avoids loading flash) */
  initialClosedWidgets?: string[];
}

export function PageLayoutProvider({
  children,
  pageId,
  initialOrder,
  initialClosedWidgets,
}: PageLayoutProviderProps) {
  // Read server-fetched layouts from shared context (provided by DashboardShell).
  // Props take priority over context (for dashboard which passes explicit initial data).
  const serverLayouts = useInitialLayouts();
  const serverPageData = serverLayouts[pageId];

  const resolvedInitialOrder =
    initialOrder ?? (serverPageData ? deriveWidgetOrder(serverPageData) : undefined);
  const resolvedInitialClosed = initialClosedWidgets ?? serverPageData?.closedWidgets;
  const hasInitialData = resolvedInitialOrder !== undefined;

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  const [order, setOrder] = useState<string[]>(resolvedInitialOrder ?? []);
  const [closedWidgets, setClosedWidgets] = useState<string[]>(resolvedInitialClosed ?? []);

  // Widget readiness — transient, widget self-reports
  const [widgetReadiness, setWidgetReadiness] = useState<Record<string, boolean>>({});

  const reportWidgetReady = useCallback((id: string) => {
    setWidgetReadiness((prev) => {
      if (prev[id] === true) return prev;
      return { ...prev, [id]: true };
    });
  }, []);

  const reportWidgetNotReady = useCallback((id: string) => {
    setWidgetReadiness((prev) => {
      if (prev[id] === false) return prev;
      return { ...prev, [id]: false };
    });
  }, []);

  // Load from API if no initial data provided
  const loadedRef = useRef(false);
  useEffect(() => {
    if (hasInitialData || loadedRef.current) return;
    loadedRef.current = true;
    let cancelled = false;
    apiFetch("/api/dashboard-preferences")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const pageData = data.pageLayouts?.[pageId];
        if (pageData) {
          setOrder(deriveWidgetOrder(pageData));
          setClosedWidgets(pageData.closedWidgets ?? []);
        }
        setIsLoading(false);
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [hasInitialData, pageId]);

  // ── Save queue with retry + beforeunload guard ──────────────────────────────
  // Mirrors the pattern from DashboardLayoutContext lines 188-240.

  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const isSavePendingRef = useRef(false);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isSavePendingRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const save = useCallback(
    (nextOrder: string[], nextClosed: string[]): Promise<void> => {
      setIsSaving(true);
      const body = JSON.stringify({
        pageLayouts: {
          [pageId]: {
            order: nextOrder,
            closedWidgets: nextClosed,
          },
        },
      });

      const attempt = (retries: number, delay: number): Promise<void> =>
        apiFetch("/api/dashboard-preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        })
          .then((res) => {
            if (!res.ok && retries > 0) {
              return new Promise<void>((resolve) =>
                setTimeout(() => resolve(attempt(retries - 1, delay * 2)), delay)
              );
            }
          })
          .catch((err) => {
            if (retries > 0) {
              return new Promise<void>((resolve) =>
                setTimeout(() => resolve(attempt(retries - 1, delay * 2)), delay)
              );
            }
          });

      isSavePendingRef.current = true;
      const thisPromise = saveQueueRef.current
        .then(() => attempt(2, 500))
        .catch(() => {}) // don't stall queue on persistent failure
        .finally(() => {
          // Only clear pending flag if this is the last queued save
          if (saveQueueRef.current === thisPromise) {
            isSavePendingRef.current = false;
          }
          setIsSaving(false);
        });
      saveQueueRef.current = thisPromise;
      return thisPromise;
    },
    [pageId]
  );

  // ── Callbacks ───────────────────────────────────────────────────────────────

  const onReorder = useCallback(
    (nextOrder: string[]) => {
      setOrder(nextOrder);
      save(nextOrder, closedWidgets);
    },
    [save, closedWidgets]
  );

  const onCloseWidget = useCallback(
    (id: string) => {
      setClosedWidgets((prev) => {
        if (prev.includes(id)) return prev;
        const next = [...prev, id];
        save(order, next);
        return next;
      });
    },
    [save, order]
  );

  const onOpenWidget = useCallback(
    (id: string) => {
      setClosedWidgets((prev) => {
        const next = prev.filter((w) => w !== id);
        save(order, next);
        return next;
      });
    },
    [save, order]
  );

  const onReset = useCallback(() => {
    setOrder([]);
    setClosedWidgets([]);
    save([], []);
  }, [save]);

  // ── Memoized context value ───────────────────────────────────────────────────

  const value = useMemo<PageLayoutState>(
    () => ({
      order,
      onReorder,
      closedWidgets,
      onCloseWidget,
      onOpenWidget,
      onReset,
      isLoading,
      isSaving,
      isEditMode,
      setIsEditMode,
      widgetReadiness,
      reportWidgetReady,
      reportWidgetNotReady,
    }),
    [
      order,
      onReorder,
      closedWidgets,
      onCloseWidget,
      onOpenWidget,
      onReset,
      isLoading,
      isSaving,
      isEditMode,
      setIsEditMode,
      widgetReadiness,
      reportWidgetReady,
      reportWidgetNotReady,
    ]
  );

  return (
    <PageLayoutCtx.Provider value={value}>
      {children}
    </PageLayoutCtx.Provider>
  );
}
