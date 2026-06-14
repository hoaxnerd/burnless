"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api-fetch";
import {
  resolveFeatureStatus,
  DEFAULT_AI_FLAGS,
  DEFAULT_COMPANION_NAME,
  type AiFeatureName,
  type AiFeatureFlagsState,
  type AiFeatureStatus,
} from "@burnless/ai";

// ── Credit types ────────────────────────────────────────────────────────────

export interface CreditStatus {
  used: number;
  total: number;
  remaining: number;
  percentUsed: number;
  warning: boolean;
  exceeded: boolean;
}

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
  /** Current credit status (used, remaining, warning, exceeded) */
  credits: CreditStatus | null;
  /** Configurable companion name */
  companionName: string;
}

const AiFeatureContext = createContext<AiFeatureContextValue | null>(null);

// ── Provider ────────────────────────────────────────────────────────────────

export function AiFeatureProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<AiFeatureFlagsState>(DEFAULT_AI_FLAGS);
  const [credits, setCredits] = useState<CreditStatus | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    apiFetch("/api/ai-features")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setFlags({
            masterEnabled: data.masterEnabled,
            dataMode: data.dataMode,
            writeMode: data.writeMode ?? "confirm",
            companionName: data.companionName ?? DEFAULT_COMPANION_NAME,
            features: data.features,
          });
          if (data.credits) setCredits(data.credits);
        }
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
      // Optimistic update for immediate UI feedback
      const prevFlags = flags;

      // NOTE: company-level writeMode is no longer enforced or surfaced (spec §3.5);
      // per-user AI tool permissions govern instead. The DB column + API field remain
      // but the UI does not read/write writeMode here.
      if (patch.masterEnabled !== undefined || patch.dataMode || patch.features || patch.companionName) {
        setFlags((prev) => ({
          ...prev,
          ...(patch.masterEnabled !== undefined ? { masterEnabled: patch.masterEnabled } : {}),
          ...(patch.dataMode ? { dataMode: patch.dataMode } : {}),
          ...(patch.companionName ? { companionName: patch.companionName } : {}),
          ...(patch.features ? { features: { ...prev.features, ...patch.features } } : {}),
        }));
      }

      try {
        const res = await apiFetch("/api/ai-features", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (res.ok) {
          const updated = await res.json();
          setFlags({
            masterEnabled: updated.masterEnabled,
            dataMode: updated.dataMode,
            writeMode: updated.writeMode ?? "confirm",
            companionName: updated.companionName ?? DEFAULT_COMPANION_NAME,
            features: updated.features,
          });
          if (updated.credits) setCredits(updated.credits);
        } else {
          // Revert optimistic update on failure
          setFlags(prevFlags);
        }
      } catch {
        // Revert optimistic update on network error
        setFlags(prevFlags);
      }
    },
    [flags]
  );

  return (
    <AiFeatureContext.Provider
      value={{
        flags,
        loaded,
        getFeature,
        updateFlags,
        masterEnabled: flags.masterEnabled,
        credits,
        companionName: flags.companionName ?? DEFAULT_COMPANION_NAME,
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
 * Optional variant — returns null outside AiFeatureProvider.
 */
export function useOptionalAiFlags(): AiFeatureContextValue | null {
  return useContext(AiFeatureContext);
}

/**
 * Check a specific AI feature's status.
 * Returns { enabled, canGenerate, showCached }.
 */
export function useAiFeature(feature: AiFeatureName): AiFeatureStatus & { loaded: boolean } {
  const { getFeature, loaded } = useAiFlags();
  return { ...getFeature(feature), loaded };
}
