"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { captureException } from "@/lib/error-reporting";
import { classifyError, type ErrorVariant } from "@/components/ui/data-load-error";

// Re-export for convenience
export type { ErrorVariant };

interface UseDataFetchOptions {
  /** Timeout in ms before showing "slow" indicator (default: 5000) */
  slowThresholdMs?: number;
  /** Timeout in ms before aborting the request (default: 15000) */
  abortTimeoutMs?: number;
  /** Skip fetch entirely (e.g. when dependencies aren't ready) */
  skip?: boolean;
}

interface UseDataFetchResult<T> {
  data: T | null;
  loading: boolean;
  /** True when request exceeds slowThresholdMs but hasn't timed out */
  slow: boolean;
  error: string | null;
  errorVariant: ErrorVariant | null;
  retry: () => void;
  retrying: boolean;
}

/**
 * Client-side data fetching hook with timeout handling, error classification,
 * and retry support.
 *
 * @param url – API endpoint to fetch
 * @param options – timeout and skip configuration
 */
export function useDataFetch<T = unknown>(
  url: string,
  options: UseDataFetchOptions = {},
): UseDataFetchResult<T> {
  const { slowThresholdMs = 5000, abortTimeoutMs = 15000, skip = false } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!skip);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorVariant, setErrorVariant] = useState<ErrorVariant | null>(null);
  const [retrying, setRetrying] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(
    async (isRetry = false) => {
      if (skip) return;

      // Cancel any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (isRetry) setRetrying(true);
      setLoading(true);
      setSlow(false);
      setError(null);
      setErrorVariant(null);

      // Slow indicator timer
      const slowTimer = setTimeout(() => {
        if (mountedRef.current) setSlow(true);
      }, slowThresholdMs);

      // Abort timer
      const abortTimer = setTimeout(() => {
        controller.abort();
      }, abortTimeoutMs);

      try {
        const res = await apiFetch(url, { signal: controller.signal });
        clearTimeout(slowTimer);
        clearTimeout(abortTimer);

        if (!res.ok) {
          const variant = res.status >= 500 ? "server" : "generic";
          const body = await res.json().catch(() => ({}));
          const msg = body.error || `Request failed (${res.status})`;
          if (mountedRef.current) {
            setError(msg);
            setErrorVariant(variant);
          }
          // Log error
          captureException(new Error(`Data load failed: ${url} (${res.status})`));
          return;
        }

        const json = await res.json();
        if (mountedRef.current) setData(json);
      } catch (err) {
        clearTimeout(slowTimer);
        clearTimeout(abortTimer);

        if (controller.signal.aborted && mountedRef.current) {
          setError("Request timed out. Please try again.");
          setErrorVariant("timeout");
        } else if (mountedRef.current) {
          const variant = classifyError(err);
          setError(err instanceof Error ? err.message : "Failed to load data");
          setErrorVariant(variant);
        }

        // Log error
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          captureException(err);
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          setSlow(false);
          setRetrying(false);
        }
      }
    },
    [url, skip, slowThresholdMs, abortTimeoutMs],
  );

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [fetchData]);

  const retry = useCallback(() => fetchData(true), [fetchData]);

  return { data, loading, slow, error, errorVariant, retry, retrying };
}
