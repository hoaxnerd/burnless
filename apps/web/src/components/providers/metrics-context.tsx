"use client";

/**
 * MetricsContext — THE single source of truth for card mode switching,
 * stats catalog, formula viewer, and per-card scenario overrides.
 *
 * Works across ALL pages — card mode overrides are namespaced by
 * pageId: "{pageId}:{slug}" to avoid collisions between pages.
 *
 * Persisted via /api/dashboard-preferences with retry + localStorage fallback.
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
  /** Global default mode for all cards */
  mode: CardMode;
  /** Set the global default mode */
  setMode: (mode: CardMode) => void;
  /** Get the effective mode for a card on a specific page */
  getCardMode: (pageId: string, slug: string) => CardMode;
  /** Set the mode for a card on a specific page (null = reset to global default) */
  setCardMode: (pageId: string, slug: string, mode: CardMode | null) => void;
  /** Check if a card has a per-card override */
  hasOverride: (pageId: string, slug: string) => boolean;
  /** Get per-card scenario override */
  getCardScenario: (pageId: string, slug: string) => string | null;
  /** Set per-card scenario override */
  setCardScenario: (pageId: string, slug: string, scenarioId: string | null) => void;
  /** Whether the stats catalog panel is open */
  catalogOpen: boolean;
  /** Open/close the stats catalog, optionally setting catalog mode */
  setCatalogOpen: (open: boolean, mode?: "manage" | "secondary") => void;
  /** Catalog mode: "manage" adds/removes cards, "secondary" adds to Key Metrics */
  catalogMode: "manage" | "secondary";
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
  /** Whether preferences are being saved */
  isSaving: boolean;
  /**
   * @deprecated Use `mode` instead. Alias kept for backward compatibility.
   */
  globalMode: CardMode;
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

// Save to API with retry
function syncToApi(
  payload: Record<string, unknown>,
  retries = 2,
  delay = 500
): Promise<void> {
  return fetch("/api/dashboard-preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  })
    .then((res) => {
      if (!res.ok && retries > 0) {
        return new Promise<void>((resolve) =>
          setTimeout(() => resolve(syncToApi(payload, retries - 1, delay * 2)), delay)
        );
      }
    })
    .catch((err) => {
      if (retries > 0) {
        return new Promise<void>((resolve) =>
          setTimeout(() => resolve(syncToApi(payload, retries - 1, delay * 2)), delay)
        );
      }
      console.error("Failed to sync preferences:", err);
    });
}

// ── Provider ─────────────────────────────────────────────────────────────────

interface MetricsProviderProps {
  children: ReactNode;
  /** Initial card mode overrides from server-side load */
  initialOverrides?: Record<string, CardMode> | null;
  /** Initial global mode */
  initialMode?: CardMode;
  /** Initial per-card scenario overrides */
  initialScenarioOverrides?: Record<string, string> | null;
}

export function MetricsProvider({
  children,
  initialOverrides,
  initialMode = "dynamic",
  initialScenarioOverrides,
}: MetricsProviderProps) {
  const [isLoading, setIsLoading] = useState(!initialOverrides);
  const [isSaving, setIsSaving] = useState(false);
  const [mode, setModeState] = useState<CardMode>(initialMode);
  const [catalogOpen, setCatalogOpenRaw] = useState(false);
  const [catalogMode, setCatalogMode] = useState<"manage" | "secondary">("manage");
  const [catalogPageId, setCatalogPageId] = useState<string | null>(null);
  const [formulaViewerSlug, setFormulaViewerSlug] = useState<string | null>(null);

  // Card mode overrides: API + localStorage merged
  const [overrides, setOverrides] = useState<Record<string, CardMode>>(() => ({
    ...(initialOverrides ?? {}),
    ...loadPageModes(),
  }));

  // Per-card scenario overrides
  const [scenarioOverrides, setScenarioOverrides] = useState<Record<string, string>>(
    () => initialScenarioOverrides ?? {}
  );

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
        if (data.mode) setModeState(data.mode as CardMode);
        if (data.cardScenarioOverrides) {
          setScenarioOverrides((prev) => ({ ...data.cardScenarioOverrides, ...prev }));
        }
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [initialOverrides]);

  // Track pending save for beforeunload guard
  const pendingSaveRef = useRef<Promise<void> | null>(null);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (pendingSaveRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const save = useCallback((payload: Record<string, unknown>) => {
    setIsSaving(true);
    const p = syncToApi(payload).finally(() => {
      pendingSaveRef.current = null;
      setIsSaving(false);
    });
    pendingSaveRef.current = p;
    return p;
  }, []);

  const setCatalogOpen = useCallback((open: boolean, m?: "manage" | "secondary") => {
    setCatalogOpenRaw(open);
    if (m) setCatalogMode(m);
  }, []);

  const setMode = useCallback(
    (m: CardMode) => {
      setModeState(m);
      save({ mode: m });
    },
    [save]
  );

  const makeKey = useCallback(
    (pageId: string, slug: string) => `${pageId}:${slug}`,
    []
  );

  const getCardMode = useCallback(
    (pageId: string, slug: string): CardMode => {
      return overrides[makeKey(pageId, slug)] ?? mode;
    },
    [overrides, mode, makeKey]
  );

  const setCardMode = useCallback(
    (pageId: string, slug: string, cardMode: CardMode | null) => {
      setOverrides((prev) => {
        const key = makeKey(pageId, slug);
        const next = { ...prev };
        if (cardMode === null) {
          delete next[key];
        } else {
          next[key] = cardMode;
        }
        // Persist page-scoped modes to localStorage
        const pageModes: Record<string, CardMode> = {};
        for (const [k, v] of Object.entries(next)) {
          if (k.includes(":")) pageModes[k] = v;
        }
        savePageModes(pageModes);
        // Sync all overrides to API
        save({ cardModeOverrides: next });
        return next;
      });
    },
    [makeKey, save]
  );

  const hasOverride = useCallback(
    (pageId: string, slug: string): boolean => {
      return makeKey(pageId, slug) in overrides;
    },
    [overrides, makeKey]
  );

  const getCardScenario = useCallback(
    (pageId: string, slug: string): string | null => {
      return scenarioOverrides[makeKey(pageId, slug)] ?? null;
    },
    [scenarioOverrides, makeKey]
  );

  const setCardScenario = useCallback(
    (pageId: string, slug: string, scenarioId: string | null) => {
      setScenarioOverrides((prev) => {
        const key = makeKey(pageId, slug);
        const next = { ...prev };
        if (scenarioId === null) {
          delete next[key];
        } else {
          next[key] = scenarioId;
        }
        save({ cardScenarioOverrides: next });
        return next;
      });
    },
    [makeKey, save]
  );

  const value = useMemo<MetricsContextState>(
    () => ({
      mode,
      setMode,
      globalMode: mode, // backward compat alias
      getCardMode,
      setCardMode,
      hasOverride,
      getCardScenario,
      setCardScenario,
      catalogOpen,
      setCatalogOpen,
      catalogMode,
      catalogPageId,
      setCatalogPageId,
      formulaViewerSlug,
      openFormulaViewer: setFormulaViewerSlug,
      closeFormulaViewer: () => setFormulaViewerSlug(null),
      registry: METRIC_REGISTRY,
      isLoading,
      isSaving,
    }),
    [
      mode,
      setMode,
      getCardMode,
      setCardMode,
      hasOverride,
      getCardScenario,
      setCardScenario,
      catalogOpen,
      setCatalogOpen,
      catalogMode,
      catalogPageId,
      formulaViewerSlug,
      isLoading,
      isSaving,
    ]
  );

  return (
    <MetricsCtx.Provider value={value}>
      {children}
    </MetricsCtx.Provider>
  );
}
