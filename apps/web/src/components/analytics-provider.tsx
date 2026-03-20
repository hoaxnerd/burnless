"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  initAnalytics,
  listenForConsent,
  trackPageView,
} from "@/lib/analytics";

/**
 * PostHog analytics provider. Initializes PostHog, listens for consent,
 * and tracks SPA page views on route changes.
 *
 * Place this inside a Suspense boundary in the root layout.
 */
export function AnalyticsProvider() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prevUrl = useRef<string>("");

  // Initialize PostHog and consent listener once
  useEffect(() => {
    initAnalytics();
    listenForConsent();
  }, []);

  // Track page views on route changes
  useEffect(() => {
    const url = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    if (url !== prevUrl.current) {
      trackPageView(window.location.origin + url);
      prevUrl.current = url;
    }
  }, [pathname, searchParams]);

  return null;
}
