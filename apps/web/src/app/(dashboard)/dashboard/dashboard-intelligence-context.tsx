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
  x: number;
  y: number;
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
  /** Add a metric as a new dashboard card (hero slot) */
  addHeroCard: (slug: string) => void;
  /** Remove a metric card from the dashboard */
  removeHeroCard: (slug: string) => void;
  /** Whether the stats catalog is open */
  catalogOpen: boolean;
  /** Catalog mode: "manage" adds/removes cards, "secondary" adds to Key Metrics */
  catalogMode: "manage" | "secondary";
  /** Open/close the stats catalog */
  setCatalogOpen: (open: boolean, mode?: "manage" | "secondary") => void;
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
  /** Whether any card uses Intelligence mode (global or per-card override) */
  hasIntelligenceCards: boolean;
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
  const [catalogOpen, setCatalogOpenRaw] = useState(false);
  const [catalogMode, setCatalogMode] = useState<"manage" | "secondary">("manage");
  const setCatalogOpen = useCallback((open: boolean, mode?: "manage" | "secondary") => {
    setCatalogOpenRaw(open);
    if (mode) setCatalogMode(mode);
  }, []);
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

  // Save preferences to API with retry on failure
  const savePrefs = useCallback(
    (updated: DashboardPreferences) => {
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
          console.error("Failed to save dashboard preferences:", err);
        });

      const savePromise = attempt(2, 500).finally(() => {
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

  // Compute whether any card uses Intelligence mode — used to gate AI processing
  const hasIntelligenceCards = useMemo(() => {
    // If global mode is intelligence, all cards without overrides use it
    if (prefs.mode === "intelligence") {
      // Check if at least one card does NOT override away from intelligence
      const overrideCount = Object.values(prefs.cardModeOverrides).filter(
        (m) => m !== "intelligence"
      ).length;
      const totalCards = prefs.heroCards.length + prefs.secondaryMetrics.length;
      return overrideCount < totalCards;
    }
    // Otherwise, check if any per-card override uses intelligence
    return Object.values(prefs.cardModeOverrides).some((m) => m === "intelligence");
  }, [prefs.mode, prefs.cardModeOverrides, prefs.heroCards.length, prefs.secondaryMetrics.length]);

  const value = useMemo<DashboardIntelligenceState>(
    () => ({
      mode: prefs.mode,
      setMode,
      heroCards: prefs.heroCards,
      secondaryMetrics: prefs.secondaryMetrics,
      swapHeroCard,
      addHeroCard,
      removeHeroCard,
      reorderHeroCards,
      addSecondaryMetric,
      removeSecondaryMetric,
      reorderSecondaryMetrics,
      getCardMode,
      setCardMode,
      getCardScenario,
      setCardScenario,
      catalogOpen,
      catalogMode,
      setCatalogOpen,
      formulaViewerSlug,
      openFormulaViewer: setFormulaViewerSlug,
      closeFormulaViewer: () => setFormulaViewerSlug(null),
      registry: METRIC_REGISTRY,
      layout: prefs.layout,
      reorderLayout,
      hasIntelligenceCards,
      isLoading,
      isSaving,
      resetToDefaults,
    }),
    [
      prefs.mode,
      prefs.heroCards,
      prefs.secondaryMetrics,
      prefs.layout,
      hasIntelligenceCards,
      setMode,
      swapHeroCard,
      addHeroCard,
      removeHeroCard,
      reorderHeroCards,
      addSecondaryMetric,
      removeSecondaryMetric,
      reorderSecondaryMetrics,
      reorderLayout,
      getCardMode,
      setCardMode,
      getCardScenario,
      setCardScenario,
      setCatalogOpen,
      catalogOpen,
      catalogMode,
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
