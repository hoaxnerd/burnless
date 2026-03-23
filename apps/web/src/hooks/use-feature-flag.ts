"use client";

import { useEffect, useState, useCallback } from "react";
import { getPostHog } from "@/lib/analytics";

/**
 * React hook for feature flag evaluation (client-side).
 *
 * Returns the flag value from PostHog. Updates when flags reload.
 * Returns `undefined` while loading, then the actual value.
 *
 * @example
 *   const variant = useFeatureFlag("new-pricing-page");
 *   if (variant === "variant-a") return <PricingA />;
 *   return <PricingDefault />;
 */
export function useFeatureFlag(
  key: string,
): boolean | string | undefined {
  const [value, setValue] = useState<boolean | string | undefined>(undefined);

  const evaluate = useCallback(() => {
    const ph = getPostHog();
    if (!ph) return;
    const v = ph.getFeatureFlag(key);
    setValue(v ?? undefined);
  }, [key]);

  useEffect(() => {
    // Evaluate immediately
    evaluate();

    // Re-evaluate when PostHog loads flags (async from network)
    const ph = getPostHog();
    if (ph) {
      ph.onFeatureFlags(evaluate);
    }
  }, [evaluate]);

  return value;
}

/**
 * Convenience hook for boolean flags.
 *
 * @returns false while loading or if flag is off, true if enabled
 *
 * @example
 *   const showBanner = useFeatureFlagEnabled("promo-banner");
 *   if (!showBanner) return null;
 *   return <PromoBanner />;
 */
export function useFeatureFlagEnabled(key: string): boolean {
  const value = useFeatureFlag(key);
  return value === true;
}

/**
 * Hook for multivariate flags with a typed default.
 *
 * @example
 *   const variant = useFeatureFlagVariant("checkout-flow", "control");
 *   // variant is always a string, defaults to "control"
 */
export function useFeatureFlagVariant(
  key: string,
  defaultVariant: string = "control",
): string {
  const value = useFeatureFlag(key);
  if (typeof value === "string") return value;
  return defaultVariant;
}
