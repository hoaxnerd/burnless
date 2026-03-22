"use client";

/**
 * Dashboard Intelligence Context — provides mode switching, card customization,
 * and stats catalog state to all dashboard components.
 *
 * Three modes:
 * - Intelligence: AI decides what metrics to show (requires AI enabled)
 * - Dynamic: Data-driven defaults (deterministic, smart)
 * - Custom: User-configured, never changes automatically
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
  METRIC_REGISTRY,
  type MetricDefinition,
} from "@burnless/engine";

// ── Types ────────────────────────────────────────────────────────────────────

export type DashboardMode = "intelligence" | "dynamic" | "custom";

export interface WidgetLayout {
  widgetId: string;
  w: number;
  h: number;
}

export interface DashboardPreferences {
  mode: DashboardMode;
  heroCards: string[];
  secondaryMetrics: string[];
  cardModeOverrides: Record<string, DashboardMode>;
  cardScenarioOverrides: Record<string, string>;
  layout: WidgetLayout[];
  customMetrics: Array<{
    id: string;
    name: string;
    formula: string;
    dependsOn: string[];
  }>;
}

export interface DashboardIntelligenceState {
  /** Current global mode */
  mode: DashboardMode;
  /** Set global mode */
  setMode: (mode: DashboardMode) => void;
  /** Hero card metric slugs (ordered) */
  heroCards: string[];
  /** Secondary metric slugs (ordered) */
  secondaryMetrics: string[];
  /** Swap a hero card with a new metric */
  swapHeroCard: (index: number, newSlug: string) => void;
  /** Reorder hero cards */
  reorderHeroCards: (cards: string[]) => void;
  /** Add a secondary metric */
  addSecondaryMetric: (slug: string) => void;
  /** Remove a secondary metric */
  removeSecondaryMetric: (slug: string) => void;
  /** Reorder secondary metrics */
  reorderSecondaryMetrics: (metrics: string[]) => void;
  /** Get effective mode for a specific card (respects overrides) */
  getCardMode: (slug: string) => DashboardMode;
  /** Set per-card mode override */
  setCardMode: (slug: string, mode: DashboardMode | null) => void;
  /** Get per-card scenario override */
  getCardScenario: (slug: string) => string | null;
  /** Set per-card scenario override */
  setCardScenario: (slug: string, scenarioId: string | null) => void;
  /** Whether the stats catalog is open */
  catalogOpen: boolean;
  /** Open/close the stats catalog */
  setCatalogOpen: (open: boolean) => void;
  /** Whether the formula viewer is open for a metric */
  formulaViewerSlug: string | null;
  /** Open formula viewer for a metric */
  openFormulaViewer: (slug: string) => void;
  /** Close formula viewer */
  closeFormulaViewer: () => void;
  /** Full metric registry for catalog */
  registry: MetricDefinition[];
  /** Dashboard widget layout order */
  layout: WidgetLayout[];
  /** Reorder widgets by providing new ordered list */
  reorderLayout: (layout: WidgetLayout[]) => void;
  /** Whether preferences are loading */
  isLoading: boolean;
  /** Whether preferences are being saved */
  isSaving: boolean;
  /** Reset to defaults */
  resetToDefaults: () => void;
}

// ── Context ──────────────────────────────────────────────────────────────────

const DashboardIntelligenceContext = createContext<DashboardIntelligenceState | null>(null);

export function useDashboardIntelligence(): DashboardIntelligenceState {
  const ctx = useContext(DashboardIntelligenceContext);
  if (!ctx) {
    throw new Error("useDashboardIntelligence must be used within DashboardIntelligenceProvider");
  }
  return ctx;
}

// ── Provider ─────────────────────────────────────────────────────────────────

interface ProviderProps {
  children: ReactNode;
  /** Server-side initial preferences (avoids loading flash) */
  initialPreferences?: DashboardPreferences | null;
}

export function DashboardIntelligenceProvider({
  children,
  initialPreferences,
}: ProviderProps) {
  const [isLoading, setIsLoading] = useState(!initialPreferences);
  const [isSaving, setIsSaving] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [formulaViewerSlug, setFormulaViewerSlug] = useState<string | null>(null);

  const [prefs, setPrefs] = useState<DashboardPreferences>(() => ({
    mode: initialPreferences?.mode ?? "dynamic",
    heroCards:
      initialPreferences?.heroCards?.length
        ? initialPreferences.heroCards
        : DEFAULT_HERO_CARDS,
    secondaryMetrics:
      initialPreferences?.secondaryMetrics?.length
        ? initialPreferences.secondaryMetrics
        : DEFAULT_SECONDARY_METRICS,
    cardModeOverrides: initialPreferences?.cardModeOverrides ?? {},
    cardScenarioOverrides: initialPreferences?.cardScenarioOverrides ?? {},
    layout: initialPreferences?.layout ?? [],
    customMetrics: initialPreferences?.customMetrics ?? [],
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
          mode: data.mode ?? "dynamic",
          heroCards: data.heroCards?.length ? data.heroCards : DEFAULT_HERO_CARDS,
          secondaryMetrics: data.secondaryMetrics?.length
            ? data.secondaryMetrics
            : DEFAULT_SECONDARY_METRICS,
          cardModeOverrides: data.cardModeOverrides ?? {},
          cardScenarioOverrides: data.cardScenarioOverrides ?? {},
          layout: data.layout ?? [],
          customMetrics: data.customMetrics ?? [],
        });
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
    return () => { cancelled = true; };
  }, [initialPreferences]);

  // Track pending save for beforeunload guard
  const pendingSaveRef = useRef<Promise<void> | null>(null);

  // Warn user if they try to leave with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (pendingSaveRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Save preferences to API
  const savePrefs = useCallback(
    (updated: DashboardPreferences) => {
      setIsSaving(true);
      const savePromise = fetch("/api/dashboard-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
        keepalive: true,
      })
        .then(() => {})
        .catch(console.error)
        .finally(() => {
          pendingSaveRef.current = null;
          setIsSaving(false);
        });
      pendingSaveRef.current = savePromise;
    },
    []
  );

  const updatePrefs = useCallback(
    (updater: (prev: DashboardPreferences) => DashboardPreferences) => {
      setPrefs((prev) => {
        const next = updater(prev);
        savePrefs(next);
        return next;
      });
    },
    [savePrefs]
  );

  const setMode = useCallback(
    (mode: DashboardMode) => updatePrefs((p) => ({ ...p, mode })),
    [updatePrefs]
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

  const getCardMode = useCallback(
    (slug: string): DashboardMode =>
      (prefs.cardModeOverrides[slug] as DashboardMode) ?? prefs.mode,
    [prefs.cardModeOverrides, prefs.mode]
  );

  const setCardMode = useCallback(
    (slug: string, mode: DashboardMode | null) =>
      updatePrefs((p) => {
        const overrides = { ...p.cardModeOverrides };
        if (mode === null) {
          delete overrides[slug];
        } else {
          overrides[slug] = mode;
        }
        return { ...p, cardModeOverrides: overrides };
      }),
    [updatePrefs]
  );

  const getCardScenario = useCallback(
    (slug: string): string | null => prefs.cardScenarioOverrides[slug] ?? null,
    [prefs.cardScenarioOverrides]
  );

  const setCardScenario = useCallback(
    (slug: string, scenarioId: string | null) =>
      updatePrefs((p) => {
        const overrides = { ...p.cardScenarioOverrides };
        if (scenarioId === null) {
          delete overrides[slug];
        } else {
          overrides[slug] = scenarioId;
        }
        return { ...p, cardScenarioOverrides: overrides };
      }),
    [updatePrefs]
  );

  const resetToDefaults = useCallback(
    () =>
      updatePrefs(() => ({
        mode: "dynamic",
        heroCards: DEFAULT_HERO_CARDS,
        secondaryMetrics: DEFAULT_SECONDARY_METRICS,
        cardModeOverrides: {},
        cardScenarioOverrides: {},
        layout: [],
        customMetrics: [],
      })),
    [updatePrefs]
  );

  const value = useMemo<DashboardIntelligenceState>(
    () => ({
      mode: prefs.mode,
      setMode,
      heroCards: prefs.heroCards,
      secondaryMetrics: prefs.secondaryMetrics,
      swapHeroCard,
      reorderHeroCards,
      addSecondaryMetric,
      removeSecondaryMetric,
      reorderSecondaryMetrics,
      getCardMode,
      setCardMode,
      getCardScenario,
      setCardScenario,
      catalogOpen,
      setCatalogOpen,
      formulaViewerSlug,
      openFormulaViewer: setFormulaViewerSlug,
      closeFormulaViewer: () => setFormulaViewerSlug(null),
      registry: METRIC_REGISTRY,
      layout: prefs.layout,
      reorderLayout,
      isLoading,
      isSaving,
      resetToDefaults,
    }),
    [
      prefs.mode,
      prefs.heroCards,
      prefs.secondaryMetrics,
      prefs.layout,
      setMode,
      swapHeroCard,
      reorderHeroCards,
      addSecondaryMetric,
      removeSecondaryMetric,
      reorderSecondaryMetrics,
      reorderLayout,
      getCardMode,
      setCardMode,
      getCardScenario,
      setCardScenario,
      catalogOpen,
      formulaViewerSlug,
      isLoading,
      isSaving,
      resetToDefaults,
    ]
  );

  return (
    <DashboardIntelligenceContext.Provider value={value}>
      {children}
    </DashboardIntelligenceContext.Provider>
  );
}
