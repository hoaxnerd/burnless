"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { captureException } from "@/lib/error-reporting";
import { classifyError } from "@/components/ui/data-load-error";
import { subscribeMutation, FINANCIAL_DOMAINS } from "@/lib/mutation-bus";
import { MUTATION_GRACE_PERIOD_MS } from "@/lib/data-mutation-tracker";

// ── Types ────────────────────────────────────────────────────────────────────

export interface InsightCacheState<T = unknown> {
  /** Current insights (or previous if loading) */
  displayData: T[];
  /** Whether a fetch is in progress */
  loading: boolean;
  /** Whether an error occurred (with no data to show) */
  error: boolean;
  /** Whether a refresh failed while stale data is still displayed */
  refreshError: boolean;
  /** Error variant for display */
  errorVariant: ReturnType<typeof classifyError>;
  /** Whether the data came from cache */
  cached: boolean;
  /** ISO timestamp of when the cache was written */
  cachedAt: string | null;
  /** Whether the cached data is stale */
  stale: boolean;
  /** Whether the underlying data has changed since the cache was written */
  dataChanged: boolean;
  /** Milliseconds remaining in the grace period (null if not in grace) */
  graceRemaining: number | null;
  /** Whether the user can trigger a refresh */
  canRefresh: boolean;
  /** Human-readable reason for staleness (e.g., "revenue_edited") */
  staleReason: string | null;
  /** Whether the LLM generation is taking >5s */
  slow: boolean;
  /** Whether an auto-regeneration (grace-settle triggered) is in progress */
  autoRegenerating: boolean;
  /** Whether the hook is still working on getting initial data (fetch + auto-generate) */
  settling: boolean;
  /** Whether the AI budget has been exceeded */
  budgetExceeded: boolean;
  /** Fetch cached data only — never triggers LLM generation */
  fetchCached: () => Promise<void>;
  /** Force-refresh: triggers LLM generation, bypasses grace period */
  refresh: (opts?: { auto?: boolean }) => Promise<void>;
}

interface UseInsightCacheOptions {
  /** Page type for the insights API */
  page: string;
  /** Scenario ID for refresh context */
  scenarioId?: string;
  /** Additional page-specific data */
  pageData?: Record<string, unknown>;
  /** Whether AI insights feature is enabled (used for auto-generation on first visit) */
  aiEnabled?: boolean;
  /** Whether the AI budget has been exceeded — blocks all LLM calls */
  budgetExceeded?: boolean;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useInsightCache<T = unknown>({
  page,
  scenarioId,
  pageData,
  aiEnabled = false,
  budgetExceeded = false,
}: UseInsightCacheOptions): InsightCacheState<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true); // Start loading — mount effect fetches immediately
  const [error, setError] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [errorVariant, setErrorVariant] = useState<ReturnType<typeof classifyError>>("generic");
  const [cached, setCached] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [dataChanged, setDataChanged] = useState(false);
  const [graceRemaining, setGraceRemaining] = useState<number | null>(null);
  const [canRefresh, setCanRefresh] = useState(true);
  const [staleReason, setStaleReason] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  // Optimistic countdown anchor (ms epoch when grace would settle). Set on each
  // mutation event; reconciled against server graceRemaining on the next fetchCached.
  const [graceUntil, setGraceUntil] = useState<number | null>(null);
  // Single-flight guard: the auto-regen fires at most ONCE per stale episode. Reset
  // when a new mutation arrives (new episode). Without this, the 1s ticker can fire
  // refresh({auto}) several times before React tears the interval down.
  const autoFiredRef = useRef(false);
  const [autoRegenerating, setAutoRegenerating] = useState(false);

  // Stale-while-revalidate: keep last good data visible during re-fetch
  const previousDataRef = useRef<T[]>([]);
  const displayData = loading && data.length === 0
    ? previousDataRef.current
    : data;

  const fetchCached = useCallback(async () => {
    setLoading(true);
    setError(false);

    try {
      const res = await apiFetch(`/api/insights?page=${page}`);
      if (res.ok) {
        const json = await res.json();
        if (json.insights?.length > 0) {
          setData(json.insights);
          previousDataRef.current = json.insights;
          setCached(true);
          setCachedAt(json.cachedAt ?? null);
          setStale(json.stale ?? false);
          setDataChanged(json.dataChanged ?? false);
          setGraceRemaining(json.graceRemaining ?? null);
          setGraceUntil(
            json.graceRemaining != null ? Date.now() + json.graceRemaining : null
          );
          setCanRefresh(json.canRefresh ?? true);
          setStaleReason(json.staleReason ?? null);
        }
      }
    } catch (err) {
      setError(true);
      setErrorVariant(classifyError(err));
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        captureException(err);
      }
    } finally {
      setLoading(false);
    }
  }, [page]);

  const refresh = useCallback(async ({ auto = false }: { auto?: boolean } = {}) => {
    if (budgetExceeded) {
      if (previousDataRef.current.length > 0) {
        setRefreshError(true);
      } else {
        setError(true);
      }
      setErrorVariant("generic");
      return;
    }
    setLoading(true);
    setError(false);
    setRefreshError(false);
    setSlow(false);
    if (auto) setAutoRegenerating(true);

    const controller = new AbortController();
    const slowTimer = setTimeout(() => setSlow(true), 5000);
    const abortTimer = setTimeout(() => controller.abort(), 180000); // 3 min — local LLMs can be slow

    try {
      const res = await apiFetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page, scenarioId, pageData, ...(auto ? { auto: true } : { forceRefresh: true }) }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error("Failed to generate insights");

      const json = await res.json();
      const fresh = json.insights ?? [];
      setData(fresh);
      if (fresh.length > 0) previousDataRef.current = fresh;
      setCached(false);
      setCachedAt(null);
      setStale(false);
      setDataChanged(false);
      setGraceRemaining(null);
      setGraceUntil(null);
      setCanRefresh(true);
      setStaleReason(null);
    } catch (err) {
      // If we have previous data, flag as refresh error (non-blocking)
      // instead of full error (which hides everything)
      if (previousDataRef.current.length > 0) {
        setRefreshError(true);
      } else {
        setError(true);
      }
      setErrorVariant(classifyError(err));
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        captureException(err);
      }
    } finally {
      setLoading(false);
      setSlow(false);
      setAutoRegenerating(false);
      clearTimeout(slowTimer);
      clearTimeout(abortTimer);
    }
  }, [page, scenarioId, pageData, budgetExceeded]);

  // Tick the countdown every second; when it settles, fire ONE visible-tab auto-regen.
  useEffect(() => {
    if (!dataChanged || graceUntil === null) return;
    const tick = () => {
      const remaining = graceUntil - Date.now();
      if (remaining > 0) {
        setGraceRemaining(remaining);
        return;
      }
      setGraceRemaining(0);
      // Settle: only the visible tab regenerates; hidden tabs wait for focus.
      // autoFiredRef guarantees one shot even if the interval ticks again before
      // React tears it down.
      if (
        !autoFiredRef.current &&
        typeof document !== "undefined" &&
        document.visibilityState === "visible"
      ) {
        autoFiredRef.current = true;
        setGraceUntil(null); // stop the ticker
        void refresh({ auto: true });
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [dataChanged, graceUntil, refresh]);

  // A backgrounded tab that missed settle regenerates when it next becomes visible.
  useEffect(() => {
    const onActive = () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") return;
      if (!autoFiredRef.current && dataChanged && graceUntil !== null && graceUntil - Date.now() <= 0) {
        autoFiredRef.current = true;
        setGraceUntil(null);
        void refresh({ auto: true });
      }
    };
    document.addEventListener("visibilitychange", onActive);
    window.addEventListener("focus", onActive);
    return () => {
      document.removeEventListener("visibilitychange", onActive);
      window.removeEventListener("focus", onActive);
    };
  }, [dataChanged, graceUntil, refresh]);

  // On mount: fetch cached
  useEffect(() => {
    fetchCached();
  }, [fetchCached]);

  // Live freshness: a FINANCIAL-data mutation flips the badge instantly + (re)starts
  // the sliding grace. Non-financial events ("other" — incl. the insights regen POST)
  // are ignored so auto-regen can't retrigger itself. Each event re-arms the
  // single-flight guard (it's a fresh stale episode).
  useEffect(() => {
    const off = subscribeMutation((e) => {
      if (!FINANCIAL_DOMAINS.has(e.domain)) return;
      autoFiredRef.current = false;
      setDataChanged(true);
      setGraceUntil(Date.now() + MUTATION_GRACE_PERIOD_MS);
      setGraceRemaining(MUTATION_GRACE_PERIOD_MS);
    });
    return off;
  }, []);

  // Auto-generate: if cache is empty after initial fetch and AI is enabled,
  // trigger generation so first-time visitors see insights without manual refresh
  const hasAttemptedGenerate = useRef(false);
  const [generating, setGenerating] = useState(false);
  useEffect(() => {
    if (hasAttemptedGenerate.current) return;
    if (loading) return; // Wait for initial fetch to complete
    if (data.length > 0) return; // Already have data
    if (!aiEnabled || budgetExceeded) return; // AI not enabled or budget exceeded
    hasAttemptedGenerate.current = true;
    setGenerating(true);
    refresh().finally(() => setGenerating(false));
  }, [loading, data.length, aiEnabled, budgetExceeded, refresh]);

  // Whether the hook is still working on getting data (initial fetch, or auto-generating)
  const settling = loading || generating;

  return {
    displayData,
    loading,
    error,
    refreshError,
    errorVariant,
    cached,
    cachedAt,
    stale,
    dataChanged,
    graceRemaining,
    canRefresh,
    staleReason,
    slow,
    autoRegenerating,
    settling,
    budgetExceeded,
    fetchCached,
    refresh,
  };
}
