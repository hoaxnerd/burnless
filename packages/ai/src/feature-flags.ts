/**
 * AI Feature Flags — defines the 3-tier toggle system.
 *
 * Level 1: Master switch (company-wide on/off)
 * Level 2: Per-feature toggles
 * Level 3: Data retention mode (full / show_cached / hide_all)
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type AiFeatureName =
  | "onboarding"
  | "chat"
  | "insights"
  | "uiPersonalization"
  | "autoCategorization"
  | "weeklyDigest";

export type AiDataMode = "full" | "show_cached" | "hide_all";

export type AiWriteMode = "full" | "confirm" | "read_only";

/**
 * Open feature-flag record. Keys are feature/domain identifiers; a key is
 * ENABLED unless its value is explicitly `false` (default-on / missing-key-on).
 * The 6 known features (see `AiFeatureName`) are seeded in every row; domains
 * declare additional per-company keys here first-class (no cast needed).
 */
export type AiFeatureConfig = Record<string, boolean>;

export interface AiFeatureFlagsState {
  masterEnabled: boolean;
  dataMode: AiDataMode;
  writeMode: AiWriteMode;
  features: AiFeatureConfig;
  /** Configurable companion name (default: "Companion") */
  companionName: string;
}

export interface AiFeatureStatus {
  enabled: boolean;
  canGenerate: boolean;
  showCached: boolean;
}

// ── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_COMPANION_NAME = "Companion";

export const DEFAULT_AI_FLAGS: AiFeatureFlagsState = {
  masterEnabled: true,
  dataMode: "full",
  writeMode: "confirm",
  companionName: DEFAULT_COMPANION_NAME,
  features: {
    onboarding: true,
    chat: true,
    insights: true,
    uiPersonalization: true,
    autoCategorization: true,
    weeklyDigest: true,
  },
};

// ── Feature metadata (for settings UI) ──────────────────────────────────────

export interface AiFeatureMeta {
  name: AiFeatureName;
  label: string;
  description: string;
}

export const AI_FEATURE_LIST: AiFeatureMeta[] = [
  {
    name: "onboarding",
    label: "Smart Onboarding",
    description: "AI-powered company enrichment during onboarding",
  },
  {
    name: "chat",
    label: "Chat Companion",
    description: "Conversational companion for financial planning (Cmd+K)",
  },
  {
    name: "insights",
    label: "AI Insights & Analytics",
    description: "Automated financial insights and alerts",
  },
  {
    name: "uiPersonalization",
    label: "AI UI Personalization",
    description: "AI-driven dashboard layout and recommendations",
  },
  {
    name: "autoCategorization",
    label: "Auto-Categorization",
    description: "AI-powered transaction categorization",
  },
  {
    name: "weeklyDigest",
    label: "Monday Morning CFO",
    description: "Weekly AI-generated financial digest email and in-app summary",
  },
];

// ── Resolution logic ────────────────────────────────────────────────────────

/**
 * Resolve whether a specific AI feature is active given the 3-tier flags.
 * Returns an object telling the caller what they can do.
 */
export function resolveFeatureStatus(
  flags: AiFeatureFlagsState,
  feature: AiFeatureName
): AiFeatureStatus {
  // Level 1: master switch
  if (!flags.masterEnabled) {
    return { enabled: false, canGenerate: false, showCached: false };
  }

  // Level 2: per-feature switch (default-on — only an explicit `false` disables)
  if (flags.features[feature] === false) {
    return { enabled: false, canGenerate: false, showCached: false };
  }

  // Level 3: data mode
  switch (flags.dataMode) {
    case "full":
      return { enabled: true, canGenerate: true, showCached: true };
    case "show_cached":
      return { enabled: true, canGenerate: false, showCached: true };
    case "hide_all":
      return { enabled: false, canGenerate: false, showCached: false };
  }
}

/**
 * Check if ANY LLM call is permitted (master on + data mode = full).
 * Use this server-side before making API calls.
 */
export function canMakeLlmCall(flags: AiFeatureFlagsState): boolean {
  return flags.masterEnabled && flags.dataMode === "full";
}

/**
 * Check if a specific feature can make LLM calls.
 */
export function canFeatureCallLlm(
  flags: AiFeatureFlagsState,
  feature: AiFeatureName
): boolean {
  return canMakeLlmCall(flags) && flags.features[feature] !== false;
}
