"use client";

import { SWRConfig } from "swr";
import { fetcher } from "./fetcher";
import type { ReactNode } from "react";

/**
 * App-wide SWR configuration.
 *
 * Wraps the dashboard layout so every useSWR call inherits:
 * - the JSON fetcher
 * - sensible revalidation defaults
 * - error retry backoff
 */
export function SWRProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        dedupingInterval: 2000,
        errorRetryCount: 3,
        errorRetryInterval: 1000,
        // Don't retry on 4xx — only transient server errors
        onErrorRetry: (error, _key, _config, revalidate, { retryCount }) => {
          if (error?.status >= 400 && error?.status < 500) return;
          if (retryCount >= 3) return;
          setTimeout(() => revalidate({ retryCount }), (retryCount + 1) * 1000);
        },
      }}
    >
      {children}
    </SWRConfig>
  );
}
