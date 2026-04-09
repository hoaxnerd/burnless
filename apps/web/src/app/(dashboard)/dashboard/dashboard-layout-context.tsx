"use client";

/**
 * DashboardLayoutContext — dashboard-page-only context for hero cards
 * and secondary metrics management.
 *
 * Layout concerns (savedLayout, closedWidgets, widgetReadiness, isEditMode)
 * are managed by PageLayoutProvider. This context handles only
 * dashboard card configuration.
 *
 * Card mode, catalog state, and formula viewer live in MetricsContext
 * (the app-wide single source of truth).
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
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
import {
  DEFAULT_HERO_CARDS,
  DEFAULT_SECONDARY_METRICS,
} from "@burnless/engine";
import { useMetrics } from "@/components/providers/metrics-context";

// ── Types ────────────────────────────────────────────────────────────────────

export interface DashboardCardPreferences {
  heroCards: string[];
  secondaryMetrics: string[];
  customMetrics: Array<{
    id: string;
    name: string;
    formula: string;
    dependsOn: string[];
  }>;
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
  removeHeroCard: (slug: string) => Promise<void>;
  /** Add a secondary metric */
  addSecondaryMetric: (slug: string) => void;
  /** Remove a secondary metric */
  removeSecondaryMetric: (slug: string) => Promise<void>;
  /** Swap a secondary metric at its current position */
  swapSecondaryMetric: (oldSlug: string, newSlug: string) => void;
  /** Reorder secondary metrics */
  reorderSecondaryMetrics: (metrics: string[]) => void;
  /** Whether any card uses Intelligence mode (global or per-card override) */
  hasIntelligenceCards: boolean;
  /** Whether card preferences are being saved */
  isSaving: boolean;
  /** Reset card configuration to defaults */
  resetToDefaults: () => void;
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
  initialPreferences?: DashboardCardPreferences | null;
}

export function DashboardLayoutProvider({
  children,
  initialPreferences,
}: ProviderProps) {
  const { mode } = useMetrics();
  const router = useRouter();

  const [isSaving, setIsSaving] = useState(false);

  const [prefs, setPrefs] = useState<DashboardCardPreferences>(() => ({
    heroCards:
      initialPreferences?.heroCards?.length
        ? initialPreferences.heroCards
        : DEFAULT_HERO_CARDS,
    secondaryMetrics:
      initialPreferences?.secondaryMetrics?.length
        ? initialPreferences.secondaryMetrics
        : DEFAULT_SECONDARY_METRICS,
    customMetrics: initialPreferences?.customMetrics ?? [],
  }));

  // Load preferences from API if not provided server-side
  useEffect(() => {
    if (initialPreferences) return;
    let cancelled = false;
    apiFetch("/api/dashboard-preferences")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setPrefs({
          heroCards: data.heroCards?.length ? data.heroCards : DEFAULT_HERO_CARDS,
          secondaryMetrics: data.secondaryMetrics?.length
            ? data.secondaryMetrics
            : DEFAULT_SECONDARY_METRICS,
          customMetrics: data.customMetrics ?? [],
        });
      })
      .catch(() => {});
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

  // Save card preferences to API with retry
  const savePrefs = useCallback(
    (updated: DashboardCardPreferences | undefined): Promise<void> => {
      if (!updated) {
        console.warn("savePrefs called with undefined — skipping");
        return Promise.resolve();
      }
      setIsSaving(true);
      // Only save card-related fields — layout is managed by PageLayoutProvider
      const body = JSON.stringify({
        heroCards: updated.heroCards,
        secondaryMetrics: updated.secondaryMetrics,
        customMetrics: updated.customMetrics,
      });

      const attempt = (retries: number, delay: number): Promise<void> =>
        apiFetch("/api/dashboard-preferences", {
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
          console.error("Failed to save dashboard card preferences:", err);
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
          // Refresh server data so hero cards re-render immediately
          router.refresh();
        });
      saveQueueRef.current = thisPromise;
      return thisPromise;
    },
    []
  );

  const updatePrefs = useCallback(
    (updater: (prev: DashboardCardPreferences) => DashboardCardPreferences): Promise<void> => {
      let next: DashboardCardPreferences | undefined;
      setPrefs((prev) => {
        next = updater(prev);
        return next;
      });
      return savePrefs(next);
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

  const resetToDefaults = useCallback(
    () =>
      updatePrefs(() => ({
        heroCards: DEFAULT_HERO_CARDS,
        secondaryMetrics: DEFAULT_SECONDARY_METRICS,
        customMetrics: [],
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
      hasIntelligenceCards,
      isSaving,
      resetToDefaults,
    }),
    [
      prefs.heroCards,
      prefs.secondaryMetrics,
      hasIntelligenceCards,
      swapHeroCard,
      addHeroCard,
      removeHeroCard,
      reorderHeroCards,
      addSecondaryMetric,
      swapSecondaryMetric,
      removeSecondaryMetric,
      reorderSecondaryMetrics,
      isSaving,
      resetToDefaults,
    ]
  );

  return (
    <DashboardLayoutCtx.Provider value={value}>
      {children}
    </DashboardLayoutCtx.Provider>
  );
}
