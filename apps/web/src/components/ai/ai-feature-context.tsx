"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  resolveFeatureStatus,
  DEFAULT_AI_FLAGS,
  type AiFeatureName,
  type AiFeatureFlagsState,
  type AiFeatureStatus,
} from "@burnless/ai";

// ── Context types ───────────────────────────────────────────────────────────

interface AiFeatureContextValue {
  /** Full flags state */
  flags: AiFeatureFlagsState;
  /** Whether flags have loaded from the server */
  loaded: boolean;
  /** Check a specific feature's status */
  getFeature: (feature: AiFeatureName) => AiFeatureStatus;
  /** Update flags (calls PATCH /api/ai-features) */
  updateFlags: (patch: Partial<AiFeatureFlagsState>) => Promise<void>;
  /** Convenience: is the master switch on? */
  masterEnabled: boolean;
}

const AiFeatureContext = createContext<AiFeatureContextValue | null>(null);

// ── Provider ────────────────────────────────────────────────────────────────

export function AiFeatureProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<AiFeatureFlagsState>(DEFAULT_AI_FLAGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/ai-features")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setFlags(data);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const getFeature = useCallback(
    (feature: AiFeatureName): AiFeatureStatus => {
      return resolveFeatureStatus(flags, feature);
    },
    [flags]
  );

  const updateFlags = useCallback(
    async (patch: Partial<AiFeatureFlagsState>) => {
      const res = await fetch("/api/ai-features", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const updated = await res.json();
        setFlags(updated);
      }
    },
    []
  );

  return (
    <AiFeatureContext.Provider
      value={{
        flags,
        loaded,
        getFeature,
        updateFlags,
        masterEnabled: flags.masterEnabled,
      }}
    >
      {children}
    </AiFeatureContext.Provider>
  );
}

// ── Hook ────────────────────────────────────────────────────────────────────

/**
 * Get AI feature flags context. Must be used within AiFeatureProvider.
 */
export function useAiFlags() {
  const ctx = useContext(AiFeatureContext);
  if (!ctx) throw new Error("useAiFlags must be used within AiFeatureProvider");
  return ctx;
}

/**
 * Check a specific AI feature's status.
 * Returns { enabled, canGenerate, showCached }.
 */
export function useAiFeature(feature: AiFeatureName): AiFeatureStatus & { loaded: boolean } {
  const { getFeature, loaded } = useAiFlags();
  return { ...getFeature(feature), loaded };
}
