"use client";

/**
 * DashboardLayoutContext — dashboard-page-only context for hero cards,
 * secondary metrics, widget layout, edit mode, and widget lifecycle.
 *
 * Card mode, catalog state, and formula viewer live in MetricsContext
 * (the app-wide single source of truth). This context handles only
 * dashboard layout/card management.
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
import {
  DEFAULT_HERO_CARDS,
  DEFAULT_SECONDARY_METRICS,
} from "@burnless/engine";
import { useMetrics, type CardMode } from "@/components/providers/metrics-context";

// ── Types ────────────────────────────────────────────────────────────────────

export interface WidgetLayout {
  widgetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** true (default) = content-driven height; false = user-locked via resize */
  autoH?: boolean;
}

export interface DashboardLayoutPreferences {
  heroCards: string[];
  secondaryMetrics: string[];
  layout: WidgetLayout[];
  customMetrics: Array<{
    id: string;
    name: string;
    formula: string;
    dependsOn: string[];
  }>;
  /** Widget IDs the user has explicitly closed/hidden */
  closedWidgets: string[];
}

export interface DashboardLayoutState {
  /** Hero card metric slugs (ordered) */
  heroCards: string[];
  /** Secondary metric slugs (ordered) */
  secondaryMetrics: string[];
  /** Swap a hero card with a new metric */
  swapHeroCard: (index: number, newSlug: string) => Promise<void>;
  /** Reorder hero cards */
  reorderHeroCards: (cards: string[]) => void;
  /** Add a metric as a new dashboard card (hero slot) */
  addHeroCard: (slug: string) => void;
  /** Remove a metric card from the dashboard */
  removeHeroCard: (slug: string) => void;
  /** Add a secondary metric */
  addSecondaryMetric: (slug: string) => void;
  /** Remove a secondary metric */
  removeSecondaryMetric: (slug: string) => void;
  /** Swap a secondary metric at its current position */
  swapSecondaryMetric: (oldSlug: string, newSlug: string) => void;
  /** Reorder secondary metrics */
  reorderSecondaryMetrics: (metrics: string[]) => void;
  /** Dashboard widget layout order */
  layout: WidgetLayout[];
  /** Reorder widgets by providing new ordered list */
  reorderLayout: (layout: WidgetLayout[]) => void;
  /** Whether any card uses Intelligence mode (global or per-card override) */
  hasIntelligenceCards: boolean;
  /** Whether preferences are being saved */
  isSaving: boolean;
  /** Whether the dashboard is in edit/drag mode (transient, not persisted) */
  isEditMode: boolean;
  /** Toggle edit/drag mode */
  setIsEditMode: (editing: boolean) => void;
  /** Widget readiness — false means no data yet (transient, widget-reported) */
  widgetReadiness: Record<string, boolean>;
  /** Widget reports it has data and is ready to display */
  reportWidgetReady: (id: string) => void;
  /** Widget reports it has no data / is not ready */
  reportWidgetNotReady: (id: string) => void;
  /** Widget IDs the user has explicitly closed (persistent) */
  closedWidgets: string[];
  /** Close/hide a widget (user action, persisted) */
  closeWidget: (id: string) => void;
  /** Reopen a closed widget */
  openWidget: (id: string) => void;
  /** Reset to defaults */
  resetToDefaults: () => void;
  /** Whether layout data is loading */
  isLoading: boolean;
}

// ── Context ──────────────────────────────────────────────────────────────────

const DashboardLayoutCtx = createContext<DashboardLayoutState | null>(null);

export function useDashboardLayout(): DashboardLayoutState {
  const ctx = useContext(DashboardLayoutCtx);
  if (!ctx) {
    throw new Error("useDashboardLayout must be used within DashboardLayoutProvider");
  }
  return ctx;
}

// ── Provider ─────────────────────────────────────────────────────────────────

interface ProviderProps {
  children: ReactNode;
  /** Server-side initial preferences (avoids loading flash) */
  initialPreferences?: DashboardLayoutPreferences | null;
}

export function DashboardLayoutProvider({
  children,
  initialPreferences,
}: ProviderProps) {
  const { mode } = useMetrics();

  const [isLoading, setIsLoading] = useState(!initialPreferences);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

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

  const [prefs, setPrefs] = useState<DashboardLayoutPreferences>(() => ({
    heroCards:
      initialPreferences?.heroCards?.length
        ? initialPreferences.heroCards
        : DEFAULT_HERO_CARDS,
    secondaryMetrics:
      initialPreferences?.secondaryMetrics?.length
        ? initialPreferences.secondaryMetrics
        : DEFAULT_SECONDARY_METRICS,
    layout: initialPreferences?.layout ?? [],
    customMetrics: initialPreferences?.customMetrics ?? [],
    closedWidgets: initialPreferences?.closedWidgets ?? [],
  }));

  // Load preferences from API if not provided server-side
  useEffect(() => {
    if (initialPreferences) return;
    let cancelled = false;
    fetch("/api/dashboard-preferences")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setPrefs({
          heroCards: data.heroCards?.length ? data.heroCards : DEFAULT_HERO_CARDS,
          secondaryMetrics: data.secondaryMetrics?.length
            ? data.secondaryMetrics
            : DEFAULT_SECONDARY_METRICS,
          layout: data.layout ?? [],
          customMetrics: data.customMetrics ?? [],
          closedWidgets: data.closedWidgets ?? [],
        });
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
    return () => { cancelled = true; };
  }, [initialPreferences]);

  // Track pending save for beforeunload guard
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const isSavePendingRef = useRef(false);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isSavePendingRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Save preferences to API with retry
  const savePrefs = useCallback(
    (updated: DashboardLayoutPreferences): Promise<void> => {
      setIsSaving(true);
      const body = JSON.stringify(updated);

      const attempt = (retries: number, delay: number): Promise<void> =>
        fetch("/api/dashboard-preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).then((res) => {
          if (!res.ok && retries > 0) {
            return new Promise<void>((resolve) =>
              setTimeout(() => resolve(attempt(retries - 1, delay * 2)), delay)
            );
          }
        }).catch((err) => {
          if (retries > 0) {
            return new Promise<void>((resolve) =>
              setTimeout(() => resolve(attempt(retries - 1, delay * 2)), delay)
            );
          }
          console.error("Failed to save dashboard layout:", err);
        });

      isSavePendingRef.current = true;
      const savePromise = saveQueueRef.current
        .then(() => attempt(2, 500))
        .catch(() => {}) // don't stall queue on persistent failure
        .finally(() => {
          isSavePendingRef.current = false;
          setIsSaving(false);
        });
      saveQueueRef.current = savePromise;
      return savePromise;
    },
    []
  );

  const updatePrefs = useCallback(
    (updater: (prev: DashboardLayoutPreferences) => DashboardLayoutPreferences): Promise<void> => {
      let next: DashboardLayoutPreferences | undefined;
      setPrefs((prev) => {
        next = updater(prev);
        return next;
      });
      return savePrefs(next!);
    },
    [savePrefs]
  );

  const swapHeroCard = useCallback(
    (index: number, newSlug: string) =>
      updatePrefs((p) => {
        const cards = [...p.heroCards];
        cards[index] = newSlug;
        return { ...p, heroCards: cards };
      }),
    [updatePrefs]
  );

  const addHeroCard = useCallback(
    (slug: string) =>
      updatePrefs((p) => ({
        ...p,
        heroCards: p.heroCards.includes(slug)
          ? p.heroCards
          : [...p.heroCards, slug],
      })),
    [updatePrefs]
  );

  const removeHeroCard = useCallback(
    (slug: string) =>
      updatePrefs((p) => ({
        ...p,
        heroCards: p.heroCards.filter((s) => s !== slug),
      })),
    [updatePrefs]
  );

  const reorderHeroCards = useCallback(
    (cards: string[]) => updatePrefs((p) => ({ ...p, heroCards: cards })),
    [updatePrefs]
  );

  const addSecondaryMetric = useCallback(
    (slug: string) =>
      updatePrefs((p) => ({
        ...p,
        secondaryMetrics: p.secondaryMetrics.includes(slug)
          ? p.secondaryMetrics
          : [...p.secondaryMetrics, slug],
      })),
    [updatePrefs]
  );

  const swapSecondaryMetric = useCallback(
    (oldSlug: string, newSlug: string) =>
      updatePrefs((p) => ({
        ...p,
        secondaryMetrics: p.secondaryMetrics.map((s) => (s === oldSlug ? newSlug : s)),
      })),
    [updatePrefs]
  );

  const removeSecondaryMetric = useCallback(
    (slug: string) =>
      updatePrefs((p) => ({
        ...p,
        secondaryMetrics: p.secondaryMetrics.filter((m) => m !== slug),
      })),
    [updatePrefs]
  );

  const reorderSecondaryMetrics = useCallback(
    (metrics: string[]) => updatePrefs((p) => ({ ...p, secondaryMetrics: metrics })),
    [updatePrefs]
  );

  const reorderLayout = useCallback(
    (layout: WidgetLayout[]) => updatePrefs((p) => ({ ...p, layout })),
    [updatePrefs]
  );

  const closeWidget = useCallback(
    (id: string) =>
      updatePrefs((p) => ({
        ...p,
        closedWidgets: p.closedWidgets.includes(id) ? p.closedWidgets : [...p.closedWidgets, id],
      })),
    [updatePrefs]
  );

  const openWidget = useCallback(
    (id: string) =>
      updatePrefs((p) => ({
        ...p,
        closedWidgets: p.closedWidgets.filter((w) => w !== id),
      })),
    [updatePrefs]
  );

  const resetToDefaults = useCallback(
    () =>
      updatePrefs(() => ({
        heroCards: DEFAULT_HERO_CARDS,
        secondaryMetrics: DEFAULT_SECONDARY_METRICS,
        layout: [],
        customMetrics: [],
        closedWidgets: [],
      })),
    [updatePrefs]
  );

  // Compute whether any card uses Intelligence mode — reads from MetricsContext
  const hasIntelligenceCards = useMemo(() => {
    // If global mode is intelligence, at least some cards will use it
    return mode === "intelligence";
  }, [mode]);

  const value = useMemo<DashboardLayoutState>(
    () => ({
      heroCards: prefs.heroCards,
      secondaryMetrics: prefs.secondaryMetrics,
      swapHeroCard,
      addHeroCard,
      removeHeroCard,
      reorderHeroCards,
      addSecondaryMetric,
      swapSecondaryMetric,
      removeSecondaryMetric,
      reorderSecondaryMetrics,
      layout: prefs.layout,
      reorderLayout,
      hasIntelligenceCards,
      isSaving,
      isEditMode,
      setIsEditMode,
      widgetReadiness,
      reportWidgetReady,
      reportWidgetNotReady,
      closedWidgets: prefs.closedWidgets,
      closeWidget,
      openWidget,
      resetToDefaults,
      isLoading,
    }),
    [
      prefs.heroCards,
      prefs.secondaryMetrics,
      prefs.layout,
      prefs.closedWidgets,
      hasIntelligenceCards,
      swapHeroCard,
      addHeroCard,
      removeHeroCard,
      reorderHeroCards,
      addSecondaryMetric,
      swapSecondaryMetric,
      removeSecondaryMetric,
      reorderSecondaryMetrics,
      reorderLayout,
      closeWidget,
      openWidget,
      isSaving,
      isEditMode,
      setIsEditMode,
      widgetReadiness,
      reportWidgetReady,
      reportWidgetNotReady,
      resetToDefaults,
      isLoading,
    ]
  );

  return (
    <DashboardLayoutCtx.Provider value={value}>
      {children}
    </DashboardLayoutCtx.Provider>
  );
}
