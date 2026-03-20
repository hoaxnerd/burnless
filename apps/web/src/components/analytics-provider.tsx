"use client";

import { useEffect, useRef, useState } from "react";
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
  const [ready, setReady] = useState(false);

  // Initialize PostHog and consent listener once
  useEffect(() => {
    initAnalytics().then(() => setReady(true));
    listenForConsent();
  }, []);

  // Track page views on route changes (only after PostHog is loaded)
  useEffect(() => {
    if (!ready) return;
    const url = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    if (url !== prevUrl.current) {
      trackPageView(window.location.origin + url);
      prevUrl.current = url;
    }
  }, [pathname, searchParams, ready]);

  return null;
}
