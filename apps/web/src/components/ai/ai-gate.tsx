"use client";

import { type ReactNode } from "react";
import { useAiFeature } from "./ai-feature-context";
import type { AiFeatureName } from "@burnless/ai";

interface AiGateProps {
  /** Which AI feature to check */
  feature: AiFeatureName;
  /** Content to show when AI is enabled */
  children: ReactNode;
  /** Deterministic fallback when AI is disabled (must be good, not empty) */
  fallback?: ReactNode;
  /** If true, hide completely when disabled (no fallback). Default: false */
  hideWhenOff?: boolean;
}

/**
 * Gate component that conditionally renders AI-powered content.
 *
 * When the feature is enabled → renders children.
 * When disabled → renders fallback (or nothing if hideWhenOff).
 *
 * Usage:
 * ```tsx
 * <AiGate feature="insights" fallback={<StaticInsights />}>
 *   <AiInsights />
 * </AiGate>
 * ```
 */
export function AiGate({
  feature,
  children,
  fallback = null,
  hideWhenOff = false,
}: AiGateProps) {
  const { enabled, loaded } = useAiFeature(feature);

  // Don't render anything until flags have loaded to avoid flicker
  if (!loaded) return null;

  if (enabled) return <>{children}</>;

  if (hideWhenOff) return null;

  return <>{fallback}</>;
}
