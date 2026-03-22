"use client";

/**
 * MetricsContext — app-wide context for card mode switching, stats catalog,
 * and formula viewer. Provides mode switching on metric cards across ALL pages,
 * not just the dashboard.
 *
 * Card mode overrides are namespaced by pageId: "{pageId}:{slug}" to avoid
 * collisions between pages. Persisted via /api/dashboard-preferences.
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
import { METRIC_REGISTRY, type MetricDefinition } from "@burnless/engine";

// ── Types ────────────────────────────────────────────────────────────────────

export type CardMode = "intelligence" | "dynamic" | "custom";

export interface MetricsContextState {
  /** Get the effective mode for a card on a specific page */
  getCardMode: (pageId: string, slug: string) => CardMode;
  /** Set the mode for a card on a specific page (null = reset to global default) */
  setCardMode: (pageId: string, slug: string, mode: CardMode | null) => void;
  /** Check if a card has a per-card override */
  hasOverride: (pageId: string, slug: string) => boolean;
  /** Global default mode */
  globalMode: CardMode;
  /** Whether the stats catalog panel is open */
  catalogOpen: boolean;
  /** Open/close the stats catalog */
  setCatalogOpen: (open: boolean) => void;
  /** Current page context for the catalog */
  catalogPageId: string | null;
  /** Set the page context for catalog browsing */
  setCatalogPageId: (pageId: string | null) => void;
  /** Which metric slug is shown in the formula viewer */
  formulaViewerSlug: string | null;
  /** Open formula viewer for a metric */
  openFormulaViewer: (slug: string) => void;
  /** Close formula viewer */
  closeFormulaViewer: () => void;
  /** Full metric registry */
  registry: MetricDefinition[];
  /** Whether preferences are loading */
  isLoading: boolean;
}

// ── Context ──────────────────────────────────────────────────────────────────

const MetricsCtx = createContext<MetricsContextState | null>(null);

/**
 * Hook to access the metrics context. Works on any page wrapped by
 * MetricsProvider (which is in the shared dashboard layout).
 */
export function useMetrics(): MetricsContextState {
  const ctx = useContext(MetricsCtx);
  if (!ctx) {
    throw new Error("useMetrics must be used within MetricsProvider");
  }
  return ctx;
}

/**
 * Optional version — returns null when outside provider.
 * Useful for components that might render outside the dashboard layout.
 */
export function useOptionalMetrics(): MetricsContextState | null {
  return useContext(MetricsCtx);
}

// ── Storage helpers ──────────────────────────────────────────────────────────

const STORAGE_KEY = "burnless:page-card-modes";

function loadPageModes(): Record<string, CardMode> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePageModes(modes: Record<string, CardMode>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(modes));
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

// Also persist to API for cross-device sync
function syncToApi(modes: Record<string, CardMode>): void {
  fetch("/api/dashboard-preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cardModeOverrides: modes }),
  }).catch(() => {
    // Best-effort sync
  });
}

// ── Provider ─────────────────────────────────────────────────────────────────

interface MetricsProviderProps {
  children: ReactNode;
  /** Initial card mode overrides from server-side load */
  initialOverrides?: Record<string, CardMode> | null;
  /** Initial global mode */
  initialMode?: CardMode;
}

export function MetricsProvider({
  children,
  initialOverrides,
  initialMode = "dynamic",
}: MetricsProviderProps) {
  const [isLoading, setIsLoading] = useState(!initialOverrides);
  const [globalMode] = useState<CardMode>(initialMode);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogPageId, setCatalogPageId] = useState<string | null>(null);
  const [formulaViewerSlug, setFormulaViewerSlug] = useState<string | null>(null);

  // Merged overrides: API (dashboard) + localStorage (pages)
  const [overrides, setOverrides] = useState<Record<string, CardMode>>(() => ({
    ...(initialOverrides ?? {}),
    ...loadPageModes(),
  }));

  // Load from API if no initial overrides provided
  const loadedRef = useRef(false);
  useEffect(() => {
    if (initialOverrides || loadedRef.current) return;
    loadedRef.current = true;
    fetch("/api/dashboard-preferences")
      .then((r) => r.json())
      .then((data) => {
        const apiOverrides = (data.cardModeOverrides ?? {}) as Record<string, CardMode>;
        setOverrides((prev) => ({ ...apiOverrides, ...prev }));
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [initialOverrides]);

  const makeKey = useCallback(
    (pageId: string, slug: string) => `${pageId}:${slug}`,
    []
  );

  const getCardMode = useCallback(
    (pageId: string, slug: string): CardMode => {
      return overrides[makeKey(pageId, slug)] ?? globalMode;
    },
    [overrides, globalMode, makeKey]
  );

  const setCardMode = useCallback(
    (pageId: string, slug: string, mode: CardMode | null) => {
      setOverrides((prev) => {
        const key = makeKey(pageId, slug);
        const next = { ...prev };
        if (mode === null) {
          delete next[key];
        } else {
          next[key] = mode;
        }
        // Persist page-scoped modes to localStorage
        const pageModes: Record<string, CardMode> = {};
        for (const [k, v] of Object.entries(next)) {
          if (k.includes(":")) pageModes[k] = v;
        }
        savePageModes(pageModes);
        // Sync all overrides (including dashboard ones) to API
        syncToApi(next);
        return next;
      });
    },
    [makeKey]
  );

  const hasOverride = useCallback(
    (pageId: string, slug: string): boolean => {
      return makeKey(pageId, slug) in overrides;
    },
    [overrides, makeKey]
  );

  const value = useMemo<MetricsContextState>(
    () => ({
      getCardMode,
      setCardMode,
      hasOverride,
      globalMode,
      catalogOpen,
      setCatalogOpen,
      catalogPageId,
      setCatalogPageId,
      formulaViewerSlug,
      openFormulaViewer: setFormulaViewerSlug,
      closeFormulaViewer: () => setFormulaViewerSlug(null),
      registry: METRIC_REGISTRY,
      isLoading,
    }),
    [
      getCardMode,
      setCardMode,
      hasOverride,
      globalMode,
      catalogOpen,
      catalogPageId,
      formulaViewerSlug,
      isLoading,
    ]
  );

  return (
    <MetricsCtx.Provider value={value}>
      {children}
    </MetricsCtx.Provider>
  );
}
