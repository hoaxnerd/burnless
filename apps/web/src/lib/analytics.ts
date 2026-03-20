import type { PostHog } from "posthog-js";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let initialized = false;
let posthog: PostHog | null = null;

/** Initialize PostHog. Safe to call multiple times — only runs once. */
export async function initAnalytics() {
  if (initialized || typeof window === "undefined" || !POSTHOG_KEY) return;

  const { default: ph } = await import("posthog-js");
  posthog = ph;

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false, // we handle this manually for SPA routing
    capture_pageleave: true,
    persistence: "localStorage+cookie",
    loaded: () => {
      // Respect cookie consent — opt out by default until consent given
      posthog!.opt_out_capturing();
      applyConsentState();
    },
  });

  initialized = true;
}

/** Apply consent from localStorage. Call after consent changes. */
function applyConsentState() {
  if (typeof window === "undefined" || !posthog) return;
  try {
    const raw = localStorage.getItem("burnless-cookie-consent");
    if (!raw) return;
    const { preferences } = JSON.parse(raw);
    if (preferences?.analytics) {
      posthog.opt_in_capturing();
    } else {
      posthog.opt_out_capturing();
    }
  } catch {
    // no consent stored — stay opted out
  }
}

/** Listen for consent changes from the cookie banner */
export function listenForConsent() {
  if (typeof window === "undefined") return;
  window.addEventListener("burnless-consent-update", ((
    e: CustomEvent<{ analytics: boolean; marketing: boolean }>
  ) => {
    if (!posthog) return;
    if (e.detail.analytics) {
      posthog.opt_in_capturing();
    } else {
      posthog.opt_out_capturing();
    }
  }) as EventListener);
}

/** Track a custom event */
export function trackEvent(
  event: string,
  properties?: Record<string, unknown>
) {
  if (!initialized || typeof window === "undefined" || !posthog) return;
  posthog.capture(event, properties);
}

/** Track a page view (for SPA navigation) */
export function trackPageView(url?: string) {
  if (!initialized || typeof window === "undefined" || !posthog) return;
  posthog.capture("$pageview", {
    $current_url: url ?? window.location.href,
  });
}

/** Identify a user after login/signup */
export function identifyUser(
  userId: string,
  traits?: Record<string, unknown>
) {
  if (!initialized || typeof window === "undefined" || !posthog) return;
  posthog.identify(userId, traits);
}

/** Reset identity on logout */
export function resetAnalytics() {
  if (!initialized || typeof window === "undefined" || !posthog) return;
  posthog.reset();
}

/** Get PostHog instance for advanced usage (feature flags, etc.) */
export function getPostHog() {
  return initialized ? posthog : null;
}
