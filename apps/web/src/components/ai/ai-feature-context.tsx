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

// ── Budget types ────────────────────────────────────────────────────────────

export interface BudgetStatus {
  spentCents: number;
  budgetCents: number;
  percentUsed: number;
  warning: boolean;
  exceeded: boolean;
}

export interface AiProviderConfig {
  aiProvider: string | null;
  aiApiKey: string | null; // masked
  aiModel: string | null;
  aiBaseUrl: string | null;
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
  updateFlags: (patch: Partial<AiFeatureFlagsState & { monthlyBudgetCents?: number } & AiProviderConfig>) => Promise<void>;
  /** Convenience: is the master switch on? */
  masterEnabled: boolean;
  /** Monthly budget cap in cents */
  monthlyBudgetCents: number;
  /** Current budget status (spend, warning, exceeded) */
  budget: BudgetStatus | null;
  /** AI provider configuration (masked API key) */
  providerConfig: AiProviderConfig;
}

const AiFeatureContext = createContext<AiFeatureContextValue | null>(null);

// ── Provider ────────────────────────────────────────────────────────────────

export function AiFeatureProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<AiFeatureFlagsState>(DEFAULT_AI_FLAGS);
  const [monthlyBudgetCents, setMonthlyBudgetCents] = useState(5000);
  const [budget, setBudget] = useState<BudgetStatus | null>(null);
  const [providerConfig, setProviderConfig] = useState<AiProviderConfig>({
    aiProvider: null,
    aiApiKey: null,
    aiModel: null,
    aiBaseUrl: null,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/ai-features")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setFlags({
            masterEnabled: data.masterEnabled,
            dataMode: data.dataMode,
            writeMode: data.writeMode ?? "full",
            features: data.features,
          });
          if (data.monthlyBudgetCents != null) setMonthlyBudgetCents(data.monthlyBudgetCents);
          if (data.budget) setBudget(data.budget);
          setProviderConfig({
            aiProvider: data.aiProvider ?? null,
            aiApiKey: data.aiApiKey ?? null,
            aiModel: data.aiModel ?? null,
            aiBaseUrl: data.aiBaseUrl ?? null,
          });
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
    async (patch: Partial<AiFeatureFlagsState & { monthlyBudgetCents?: number } & AiProviderConfig>) => {
      // Optimistic update for immediate UI feedback
      const prevFlags = flags;
      const prevBudgetCents = monthlyBudgetCents;
      const prevProvider = providerConfig;

      if (patch.masterEnabled !== undefined || patch.dataMode || patch.writeMode || patch.features) {
        setFlags((prev) => ({
          ...prev,
          ...(patch.masterEnabled !== undefined ? { masterEnabled: patch.masterEnabled } : {}),
          ...(patch.dataMode ? { dataMode: patch.dataMode } : {}),
          ...(patch.writeMode ? { writeMode: patch.writeMode } : {}),
          ...(patch.features ? { features: { ...prev.features, ...patch.features } } : {}),
        }));
      }

      try {
        const res = await fetch("/api/ai-features", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (res.ok) {
          const updated = await res.json();
          setFlags({
            masterEnabled: updated.masterEnabled,
            dataMode: updated.dataMode,
            writeMode: updated.writeMode ?? "full",
            features: updated.features,
          });
          if (updated.monthlyBudgetCents != null) setMonthlyBudgetCents(updated.monthlyBudgetCents);
          if (updated.budget) setBudget(updated.budget);
          setProviderConfig({
            aiProvider: updated.aiProvider ?? null,
            aiApiKey: updated.aiApiKey ?? null,
            aiModel: updated.aiModel ?? null,
            aiBaseUrl: updated.aiBaseUrl ?? null,
          });
        } else {
          // Revert optimistic update on failure
          setFlags(prevFlags);
          setMonthlyBudgetCents(prevBudgetCents);
          setProviderConfig(prevProvider);
          console.error(`AI feature update failed: ${res.status}`);
        }
      } catch {
        // Revert optimistic update on network error
        setFlags(prevFlags);
        setMonthlyBudgetCents(prevBudgetCents);
        setProviderConfig(prevProvider);
        console.error("AI feature update failed: network error");
      }
    },
    [flags, monthlyBudgetCents, providerConfig]
  );

  return (
    <AiFeatureContext.Provider
      value={{
        flags,
        loaded,
        getFeature,
        updateFlags,
        masterEnabled: flags.masterEnabled,
        monthlyBudgetCents,
        budget,
        providerConfig,
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
