"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { captureException } from "@/lib/error-reporting";
import { classifyError } from "@/components/ui/data-load-error";

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
  /** Whether the hook is still working on getting initial data (fetch + auto-generate) */
  settling: boolean;
  /** Fetch cached data only — never triggers LLM generation */
  fetchCached: () => Promise<void>;
  /** Force-refresh: triggers LLM generation, bypasses grace period */
  refresh: () => Promise<void>;
}

interface UseInsightCacheOptions {
  /** Page type for the insights API */
  page: string;
  /** Scenario ID for refresh context */
  scenarioId?: string;
  /** Additional page-specific data */
  pageData?: Record<string, unknown>;
  /** Auto-refresh interval in ms after grace period expires (default: 30000 = 30s) */
  autoRefreshDelayMs?: number;
  /** Whether AI insights feature is enabled (used for auto-generation on first visit) */
  aiEnabled?: boolean;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useInsightCache<T = unknown>({
  page,
  scenarioId,
  pageData,
  autoRefreshDelayMs = 30_000,
  aiEnabled = false,
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

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    setRefreshError(false);
    setSlow(false);

    const controller = new AbortController();
    const slowTimer = setTimeout(() => setSlow(true), 5000);
    const abortTimer = setTimeout(() => controller.abort(), 180000); // 3 min — local LLMs can be slow

    try {
      const res = await apiFetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page, scenarioId, pageData, forceRefresh: true }),
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
      clearTimeout(slowTimer);
      clearTimeout(abortTimer);
    }
  }, [page, scenarioId, pageData]);

  // Auto-refresh: when grace period just expired, schedule a re-fetch
  useEffect(() => {
    if (!dataChanged || loading) return;
    if (graceRemaining !== null && graceRemaining > 0) {
      // Grace still active — schedule a re-fetch when it expires
      const timer = setTimeout(() => {
        fetchCached();
      }, graceRemaining + autoRefreshDelayMs);
      return () => clearTimeout(timer);
    }
  }, [dataChanged, graceRemaining, loading, fetchCached, autoRefreshDelayMs]);

  // On mount: fetch cached
  useEffect(() => {
    fetchCached();
  }, [fetchCached]);

  // Auto-generate: if cache is empty after initial fetch and AI is enabled,
  // trigger generation so first-time visitors see insights without manual refresh
  const hasAttemptedGenerate = useRef(false);
  const [generating, setGenerating] = useState(false);
  useEffect(() => {
    if (hasAttemptedGenerate.current) return;
    if (loading) return; // Wait for initial fetch to complete
    if (data.length > 0) return; // Already have data
    if (!aiEnabled) return; // AI not enabled
    hasAttemptedGenerate.current = true;
    setGenerating(true);
    refresh().finally(() => setGenerating(false));
  }, [loading, data.length, aiEnabled, refresh]);

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
    settling,
    fetchCached,
    refresh,
  };
}
