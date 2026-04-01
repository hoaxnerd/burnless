"use client";

/**
 * PageLayoutProvider — universal per-page layout persistence context.
 *
 * Replaces both DashboardLayoutContext (for layout concerns) and the
 * usePageLayout hook. Every page uses this instead of wiring layout
 * management independently.
 *
 * Manages per-page:
 * - savedLayout + onLayoutChange — widget positions/sizes
 * - closedWidgets + onCloseWidget/onOpenWidget — user-hidden widgets
 * - widgetReadiness + reportWidgetReady/reportWidgetNotReady — widget data state
 * - isEditMode + setIsEditMode — drag/resize mode toggle
 * - isLoading / isSaving — loading states
 *
 * Persistence format (merged into dashboard-preferences API):
 * { pageLayouts: { [pageId]: { layout: [...], closedWidgets: [...] } } }
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
import type { PageWidgetLayout } from "@/components/ui/page-grid";
import { useInitialLayouts } from "./initial-layouts-context";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PageLayoutState {
  savedLayout: PageWidgetLayout[];
  onLayoutChange: (layout: PageWidgetLayout[]) => void;
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
  /** Server-side initial layout (avoids loading flash) */
  initialLayout?: PageWidgetLayout[];
  /** Server-side initial closed widgets (avoids loading flash) */
  initialClosedWidgets?: string[];
}

export function PageLayoutProvider({
  children,
  pageId,
  initialLayout,
  initialClosedWidgets,
}: PageLayoutProviderProps) {
  // Read server-fetched layouts from shared context (provided by DashboardShell).
  // Props take priority over context (for dashboard which passes explicit initial data).
  const serverLayouts = useInitialLayouts();
  const serverPageData = serverLayouts[pageId];

  const resolvedInitialLayout = initialLayout ?? serverPageData?.layout;
  const resolvedInitialClosed = initialClosedWidgets ?? serverPageData?.closedWidgets;
  const hasInitialData = resolvedInitialLayout !== undefined;

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  const [layout, setLayout] = useState<PageWidgetLayout[]>(resolvedInitialLayout ?? []);
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
          setLayout(pageData.layout ?? []);
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
    (nextLayout: PageWidgetLayout[], nextClosed: string[]): Promise<void> => {
      setIsSaving(true);
      const body = JSON.stringify({
        pageLayouts: {
          [pageId]: {
            layout: nextLayout,
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
            console.error(`Failed to save ${pageId} layout:`, err);
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

  // ── Memoized context value ───────────────────────────────────────────────────

  const value = useMemo<PageLayoutState>(
    () => ({
      savedLayout: layout,
      onLayoutChange,
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
      layout,
      onLayoutChange,
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
