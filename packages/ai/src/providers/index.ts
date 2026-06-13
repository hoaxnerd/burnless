/**
 * Provider factory — resolves which LLM provider to use based on configuration.
 *
 * Configuration hierarchy:
 *   1. Explicit config passed to createProvider()
 *   2. Environment variables (AI_PROVIDER, AI_MODEL, AI_API_KEY, AI_BASE_URL)
 *   3. Legacy env vars (ANTHROPIC_API_KEY → Anthropic provider)
 *   4. Defaults (Anthropic + claude-sonnet-4-20250514)
 *
 * To add a new provider kind: add a `kind` branch in resolveProviderSpec/buildModel
 * (packages/ai/src/providers/ai-sdk-provider.ts) — the OpenAI-compatible escape hatch
 * already covers any OpenAI-shaped endpoint — then register it in PROVIDER_MAP below.
 */

import type { LlmProvider } from "./base";
import type { ProviderConfig, ModelTier } from "./types";
import { AiSdkProvider, buildModel } from "./ai-sdk-provider";

// ── Provider registry ───────────────────────────────────────────────────────

type ProviderFactory = (config: ProviderConfig) => LlmProvider;

const PROVIDER_MAP: Record<string, ProviderFactory> = {
  anthropic: (config) => new AiSdkProvider(buildModel("anthropic", config), config),
  openai: (config) => new AiSdkProvider(buildModel("openai", config), config),
  openrouter: (config) => new AiSdkProvider(buildModel("openrouter", config), config),
  ollama: (config) => new AiSdkProvider(buildModel("ollama", config), config),
};

// ── Default models per provider ─────────────────────────────────────────────
// All model IDs are overridable via env vars:
//   AI_MODEL_DEFAULT_<PROVIDER>    — default model for a provider
//   AI_MODEL_<PROVIDER>_<TIER>     — tier-specific model override (e.g. AI_MODEL_ANTHROPIC_FAST)
// This avoids code changes when upgrading to new model versions.

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: process.env.AI_MODEL_DEFAULT_ANTHROPIC ?? "claude-sonnet-4-20250514",
  openai: process.env.AI_MODEL_DEFAULT_OPENAI ?? "gpt-4o",
  openrouter: process.env.AI_MODEL_DEFAULT_OPENROUTER ?? "anthropic/claude-sonnet-4-20250514",
  ollama: process.env.AI_MODEL_DEFAULT_OLLAMA ?? "gemma4:26b",
};

// ── Tier → model mapping per provider ───────────────────────────────────────

const TIER_MODELS: Record<string, Record<ModelTier, string>> = {
  anthropic: {
    fast: process.env.AI_MODEL_ANTHROPIC_FAST ?? "claude-haiku-4-5-20251001",
    standard: process.env.AI_MODEL_ANTHROPIC_STANDARD ?? "claude-sonnet-4-20250514",
    deep: process.env.AI_MODEL_ANTHROPIC_DEEP ?? "claude-sonnet-4-20250514",
  },
  openai: {
    fast: process.env.AI_MODEL_OPENAI_FAST ?? "gpt-4o-mini",
    standard: process.env.AI_MODEL_OPENAI_STANDARD ?? "gpt-4o",
    deep: process.env.AI_MODEL_OPENAI_DEEP ?? "o4-mini",
  },
  openrouter: {
    fast: process.env.AI_MODEL_OPENROUTER_FAST ?? "anthropic/claude-haiku-4-5-20251001",
    standard: process.env.AI_MODEL_OPENROUTER_STANDARD ?? "anthropic/claude-sonnet-4-20250514",
    deep: process.env.AI_MODEL_OPENROUTER_DEEP ?? "anthropic/claude-sonnet-4-20250514",
  },
  // Ollama uses the same model for all tiers (single local model)
  // Override via AI_MODEL_OLLAMA_FAST etc. if running multiple models
  ollama: {
    fast: process.env.AI_MODEL_OLLAMA_FAST ?? "gemma4:26b",
    standard: process.env.AI_MODEL_OLLAMA_STANDARD ?? "gemma4:26b",
    deep: process.env.AI_MODEL_OLLAMA_DEEP ?? "gemma4:26b",
  },
};

/** Fallback order: if preferred tier model fails, try the next tier up. */
const TIER_FALLBACK: Record<ModelTier, ModelTier[]> = {
  fast: ["standard", "deep"],
  standard: ["deep", "fast"],
  deep: ["standard", "fast"],
};

/** Resolve the model ID for a given provider and tier. */
export function resolveModelForTier(
  providerName: string,
  tier: ModelTier
): string {
  const tierMap = TIER_MODELS[providerName];
  if (tierMap?.[tier]) return tierMap[tier];
  // Fall back to the default model for this provider
  return DEFAULT_MODELS[providerName] ?? "";
}

/** Get the fallback tiers to try if the preferred tier fails. */
export function getFallbackTiers(tier: ModelTier): ModelTier[] {
  return TIER_FALLBACK[tier];
}

// ── Factory ─────────────────────────────────────────────────────────────────

export interface CreateProviderOptions {
  provider?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
}

/**
 * Create an LLM provider instance.
 *
 * Resolves configuration from explicit options → env vars → defaults.
 * Returns null if no API key is available (graceful degradation).
 */
export function createProvider(
  options: CreateProviderOptions = {}
): LlmProvider | null {
  const providerName =
    options.provider ??
    process.env.AI_PROVIDER ??
    (process.env.ANTHROPIC_API_KEY ? "anthropic" : null) ??
    (process.env.OPENAI_API_KEY ? "openai" : null) ??
    (process.env.OPENROUTER_API_KEY ? "openrouter" : null) ??
    "anthropic";

  const factory = PROVIDER_MAP[providerName];
  if (!factory) {
    console.warn(
      `[ai] Unknown provider "${providerName}". Available: ${Object.keys(PROVIDER_MAP).join(", ")}`
    );
    return null;
  }

  // Ollama doesn't need an API key — skip the key check entirely
  if (providerName === "ollama") {
    const model =
      options.model ?? process.env.AI_MODEL ?? DEFAULT_MODELS[providerName] ?? "gemma4:26b";
    return factory({
      apiKey: "ollama",
      baseUrl: options.baseUrl ?? process.env.AI_BASE_URL,
      model,
      maxTokens: options.maxTokens ?? 4096,
    });
  }

  const apiKey =
    options.apiKey ??
    process.env.AI_API_KEY ??
    (providerName === "anthropic" ? process.env.ANTHROPIC_API_KEY : undefined) ??
    (providerName === "openai" ? process.env.OPENAI_API_KEY : undefined) ??
    (providerName === "openrouter" ? process.env.OPENROUTER_API_KEY : undefined);

  if (!apiKey) {
    console.warn(
      `[ai] No API key found for provider "${providerName}". Set AI_API_KEY or the provider-specific key (e.g. ANTHROPIC_API_KEY). AI features will be unavailable.`
    );
    return null;
  }

  const model =
    options.model ?? process.env.AI_MODEL ?? DEFAULT_MODELS[providerName] ?? "";

  return factory({
    apiKey,
    baseUrl: options.baseUrl ?? process.env.AI_BASE_URL,
    model,
    maxTokens: options.maxTokens ?? 4096,
  });
}

/**
 * Create a provider for a specific model tier.
 *
 * Resolves the right model for the given tier and provider.
 * Returns null if no API key is available.
 */
export function createProviderForTier(
  tier: ModelTier,
  options: Omit<CreateProviderOptions, "model"> = {}
): LlmProvider | null {
  const providerName =
    options.provider ??
    process.env.AI_PROVIDER ??
    (process.env.ANTHROPIC_API_KEY ? "anthropic" : null) ??
    (process.env.OPENAI_API_KEY ? "openai" : null) ??
    (process.env.OPENROUTER_API_KEY ? "openrouter" : null) ??
    "anthropic";

  const model = resolveModelForTier(providerName, tier);
  return createProvider({ ...options, model });
}

// Singleton for the default provider — lazy-initialized
let _defaultProvider: LlmProvider | null | undefined;

/**
 * Get the default provider (lazy singleton).
 * Returns null if no API key is configured — callers must handle gracefully.
 */
export function getProvider(): LlmProvider | null {
  if (_defaultProvider === undefined) {
    _defaultProvider = createProvider();
  }
  return _defaultProvider;
}

/** Reset the singleton — useful for testing or config changes. */
export function resetProvider(): void {
  _defaultProvider = undefined;
}

// Re-export provider classes for direct use when needed
export { AiSdkProvider, buildModel } from "./ai-sdk-provider";
export { LlmProvider } from "./base";
export {
  ResilientProvider,
  CircuitBreaker,
  RateLimiter,
  CircuitOpenError,
  RateLimitExceededError,
  resetAllResilience,
} from "./resilience";
export type {
  RetryConfig,
  CircuitBreakerConfig,
  RateLimiterConfig,
  ResilienceConfig,
  RequestLog,
  CircuitState,
} from "./resilience";
export type {
  ProviderConfig,
  CompletionRequest,
  LlmResponse,
  StreamEvent,
  ContentBlock,
  ToolDefinition,
  LlmMessage,
  StopReason,
  ModelTier,
  UsageRecord,
} from "./types";
