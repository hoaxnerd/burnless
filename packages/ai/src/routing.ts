/**
 * AI Model Router — intelligent model selection per feature.
 *
 * Maps each AI feature to a model tier (fast/standard/deep), resolves
 * the appropriate model for the configured provider, and handles fallback
 * if the preferred tier's model fails.
 *
 * This is the primary entry point for getting a provider instance.
 * Application code should use `getProviderForFeature()` instead of
 * `getProvider()` to get automatic tier-based routing.
 */

import { LlmProvider } from "./providers/base";
import type { ModelTier, CompletionRequest, LlmResponse, StreamEvent, UsageRecord, ProviderConfig } from "./providers/types";
import {
  createProviderForTier,
  getFallbackTiers,
} from "./providers";
import {
  ResilientProvider,
  CircuitOpenError,
  getCircuitBreaker,
  getRateLimiter,
  getProviderRateLimitConfig,
  getAllProviderHealth,
  type RequestLog,
  type ProviderHealthStatus,
} from "./providers/resilience";

// ── Per-feature provider routing ──────────────────────────────────────────
//
// Allows different AI features to use different providers. This enables
// cost optimization (cheap models for classification, expensive for reasoning)
// and provider-specific strengths (e.g., Anthropic for nuance, OpenAI for speed).
//
// Configuration hierarchy for per-feature provider:
//   1. Environment variable: AI_PROVIDER_<FEATURE> (e.g., AI_PROVIDER_CHAT=openai)
//   2. FEATURE_PROVIDERS map below (code-level defaults)
//   3. Global AI_PROVIDER env var (fallback for all features)
//
// To route chat to OpenAI while keeping everything else on Anthropic:
//   AI_PROVIDER=anthropic AI_PROVIDER_CHAT=openai

/**
 * Per-feature provider overrides. Features not listed here use the global provider.
 * Edit this map to set code-level defaults; env vars override these at runtime.
 */
const FEATURE_PROVIDERS: Record<string, string> = {
  // Examples (uncomment to activate):
  // categorize_transaction: "openai",   // GPT-4o-mini is fast + cheap for classification
  // chat: "anthropic",                  // Claude excels at nuanced financial reasoning
};

// ── Feature → Tier mapping ──────────────────────────────────────────────────

/**
 * Which model tier each AI feature requires.
 *
 * - fast: simple classification, yes/no, field extraction (<1s, cheapest)
 * - standard: moderate reasoning, narrative generation, enrichment (~2-5s)
 * - deep: complex multi-turn reasoning with tool use, financial analysis (~5-15s)
 */
const FEATURE_TIERS: Record<string, ModelTier> = {
  // Fast tier — Haiku-class
  categorize_transaction: "fast",
  batch_categorize: "fast",
  proactive_alert: "fast",
  field_classification: "fast",
  page_insights: "fast",

  // Standard tier — Sonnet-class
  onboarding_enrich: "standard",
  insight_narrative: "standard",
  report_narrative: "standard",
  scenario_narrative: "standard",
  weekly_digest: "standard",

  // Deep tier — also Sonnet (upgrade to Opus when justified)
  chat: "deep",
  financial_analysis: "deep",
  scenario_generation: "deep",
};

/** Get the tier for a feature. Defaults to "standard" for unknown features. */
export function getFeatureTier(feature: string): ModelTier {
  return FEATURE_TIERS[feature] ?? "standard";
}

/** Get all registered feature→tier mappings (for dashboard display). */
export function getFeatureTierMap(): Readonly<Record<string, ModelTier>> {
  return { ...FEATURE_TIERS };
}

// ── Cost estimation ─────────────────────────────────────────────────────────

/**
 * Estimated cost per 1M tokens in microdollars (1 USD = 1,000,000 microdollars).
 * These are rough estimates — actual pricing depends on the provider's current rates.
 */
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  // Anthropic (per 1M tokens, in microdollars)
  "claude-haiku-4-5-20251001": { input: 800_000, output: 4_000_000 },
  "claude-sonnet-4-20250514": { input: 3_000_000, output: 15_000_000 },
  "claude-opus-4-6": { input: 15_000_000, output: 75_000_000 },
  // OpenAI (per 1M tokens, in microdollars)
  "gpt-4o-mini": { input: 150_000, output: 600_000 },
  "gpt-4o": { input: 2_500_000, output: 10_000_000 },
};

/** Estimate cost in microdollars for a given model and token count. */
export function estimateCostMicros(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const costs = MODEL_COSTS[model];
  if (!costs) return 0;
  return Math.round(
    (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000
  );
}

// ── Usage tracking ──────────────────────────────────────────────────────────

type UsageListener = (record: UsageRecord) => void;
const usageListeners: UsageListener[] = [];

/** Register a listener that receives every usage record (for logging, analytics). */
export function onUsage(listener: UsageListener): () => void {
  usageListeners.push(listener);
  return () => {
    const idx = usageListeners.indexOf(listener);
    if (idx >= 0) usageListeners.splice(idx, 1);
  };
}

function emitUsage(record: UsageRecord): void {
  for (const listener of usageListeners) {
    try {
      listener(record);
    } catch {
      // Don't let listener errors break the request
    }
  }
}

// ── Tracked provider wrapper ────────────────────────────────────────────────

/**
 * Wraps a provider to automatically track usage (tokens, cost, duration)
 * for every completion call. Uses composition — delegates all calls to
 * the inner provider while adding instrumentation.
 */
class TrackedProvider extends LlmProvider {
  private inner: LlmProvider;
  private feature: string;
  private tier: ModelTier;
  private providerName: string;

  constructor(
    inner: LlmProvider,
    feature: string,
    tier: ModelTier,
    providerName: string
  ) {
    // Minimal config — actual work delegated to inner provider
    super({ model: inner.modelId, apiKey: "", maxTokens: 4096 });
    this.inner = inner;
    this.feature = feature;
    this.tier = tier;
    this.providerName = providerName;
  }

  async complete(request: CompletionRequest): Promise<LlmResponse> {
    const start = Date.now();
    const response = await this.inner.complete(request);
    const durationMs = Date.now() - start;

    if (response.usage) {
      emitUsage({
        feature: this.feature,
        tier: this.tier,
        provider: this.providerName,
        model: this.inner.modelId,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        estimatedCostMicros: estimateCostMicros(
          this.inner.modelId,
          response.usage.inputTokens,
          response.usage.outputTokens
        ),
        durationMs,
        timestamp: new Date(),
      });
    }

    return response;
  }

  async *stream(request: CompletionRequest): AsyncGenerator<StreamEvent> {
    const start = Date.now();
    const events = this.inner.stream(request);

    for await (const event of events) {
      if (event.type === "done" && event.response.usage) {
        const durationMs = Date.now() - start;
        emitUsage({
          feature: this.feature,
          tier: this.tier,
          provider: this.providerName,
          model: this.inner.modelId,
          inputTokens: event.response.usage.inputTokens,
          outputTokens: event.response.usage.outputTokens,
          estimatedCostMicros: estimateCostMicros(
            this.inner.modelId,
            event.response.usage.inputTokens,
            event.response.usage.outputTokens
          ),
          durationMs,
          timestamp: new Date(),
        });
      }
      yield event;
    }
  }

  override get modelId(): string {
    return this.inner.modelId;
  }
}

// ── Request logging ──────────────────────────────────────────────────────────

type RequestLogListener = (log: RequestLog) => void;
const requestLogListeners: RequestLogListener[] = [];

/** Register a listener that receives structured request logs (for monitoring). */
export function onRequestLog(listener: RequestLogListener): () => void {
  requestLogListeners.push(listener);
  return () => {
    const idx = requestLogListeners.indexOf(listener);
    if (idx >= 0) requestLogListeners.splice(idx, 1);
  };
}

function emitRequestLog(log: RequestLog): void {
  // Always log to console for observability
  const status = log.success ? "OK" : `FAIL: ${log.error}`;
  console.log(
    `[ai] ${log.provider}/${log.model} ${log.feature ?? "unknown"} ${status} ${log.durationMs}ms` +
    `${log.attempt > 0 ? ` (retry #${log.attempt})` : ""}` +
    `${log.inputTokens ? ` tokens:${log.inputTokens}/${log.outputTokens}` : ""}` +
    ` circuit:${log.circuitState} remaining:${log.rateLimitRemaining}`
  );

  for (const listener of requestLogListeners) {
    try {
      listener(log);
    } catch {
      // Don't let listener errors break the request
    }
  }
}

// ── Resolve provider name ────────────────────────────────────────────────────

/**
 * Resolve the provider name for a given feature (or globally).
 *
 * Resolution order:
 *   1. AI_PROVIDER_<FEATURE> env var (e.g., AI_PROVIDER_CHAT)
 *   2. FEATURE_PROVIDERS code-level map
 *   3. AI_PROVIDER global env var
 *   4. Auto-detect from available API keys
 */
function resolveProviderName(feature?: string): string {
  // Per-feature env var override: AI_PROVIDER_CHAT, AI_PROVIDER_CATEGORIZE_TRANSACTION, etc.
  if (feature) {
    const envKey = `AI_PROVIDER_${feature.toUpperCase()}`;
    const envOverride = process.env[envKey];
    if (envOverride) return envOverride;

    // Code-level per-feature default
    const codeDefault = FEATURE_PROVIDERS[feature];
    if (codeDefault) return codeDefault;
  }

  // Global fallback — check for configured providers in priority order
  return (
    process.env.AI_PROVIDER ??
    (process.env.ANTHROPIC_API_KEY ? "anthropic" : null) ??
    (process.env.OPENAI_API_KEY ? "openai" : null) ??
    (process.env.OPENROUTER_API_KEY ? "openrouter" : null) ??
    (process.env.OLLAMA_BASE_URL ? "ollama" : null) ??
    "unknown"
  );
}

/** Get the current per-feature provider routing map (for dashboard display). */
export function getFeatureProviderMap(): Readonly<Record<string, string>> {
  // Merge code defaults with env overrides
  const result: Record<string, string> = { ...FEATURE_PROVIDERS };
  for (const feature of Object.keys(FEATURE_TIERS)) {
    const envKey = `AI_PROVIDER_${feature.toUpperCase()}`;
    const envOverride = process.env[envKey];
    if (envOverride) result[feature] = envOverride;
  }
  return result;
}

// ── Wrap provider with resilience ────────────────────────────────────────────

/**
 * Wrap a raw provider with shared-per-provider circuit breaker and rate limiter,
 * plus per-request retry with exponential backoff.
 */
function wrapWithResilience(
  provider: LlmProvider,
  providerName: string,
  feature?: string
): ResilientProvider {
  const rateLimitConfig = getProviderRateLimitConfig(providerName);

  return new ResilientProvider(
    provider,
    providerName,
    {
      circuitBreaker: { failureThreshold: 5, cooldownMs: 60_000, halfOpenSuccesses: 2 },
      rateLimiter: rateLimitConfig,
      onRequest: emitRequestLog,
    },
    feature
  );
}

// ── Main routing API ────────────────────────────────────────────────────────

/**
 * Get a provider instance routed to the appropriate model tier for a feature.
 *
 * The returned provider has:
 *   - Retry with exponential backoff + jitter (3 retries)
 *   - Circuit breaker (opens after 5 failures, 60s cooldown)
 *   - Per-provider rate limiting
 *   - Structured request logging
 *   - Usage tracking (tokens, cost, duration)
 *
 * Usage:
 *   const provider = getProviderForFeature("chat");
 *   const provider = getProviderForFeature("categorize_transaction");
 *
 * Returns null if no API key is configured.
 */
export function getProviderForFeature(feature: string): LlmProvider | null {
  const tier = getFeatureTier(feature);
  const providerName = resolveProviderName(feature);

  // Create provider with per-feature provider override
  const provider = createProviderForTier(tier, {
    provider: providerName !== "unknown" ? providerName : undefined,
  });
  if (!provider) {
    console.warn(`[ai-router] No provider available for feature "${feature}" (tier: ${tier}, provider: ${providerName}). AI is unconfigured.`);
    return null;
  }

  // Stack: TrackedProvider → ResilientProvider → raw provider
  // Resilience handles retries/circuit/rate, Tracked handles usage metrics
  const resilient = wrapWithResilience(provider, providerName, feature);
  return new TrackedProvider(resilient, feature, tier, providerName);
}

/**
 * Get a provider for a specific tier (when you know the tier but not the feature).
 * Prefer getProviderForFeature() when the feature name is known.
 */
export function getProviderForTier(tier: ModelTier): LlmProvider | null {
  const provider = createProviderForTier(tier);
  if (!provider) return null;

  const providerName = resolveProviderName();
  return wrapWithResilience(provider, providerName);
}

/**
 * Execute a completion with automatic fallback on failure.
 *
 * Tries the preferred tier first with full resilience (retry + circuit breaker).
 * If all retries fail or circuit is open, falls back to alternative tiers.
 */
export async function completeWithFallback(
  feature: string,
  request: CompletionRequest
): Promise<LlmResponse | null> {
  const primaryTier = getFeatureTier(feature);
  const tiersToTry: ModelTier[] = [primaryTier, ...getFallbackTiers(primaryTier)];
  const providerName = resolveProviderName(feature);

  for (const tier of tiersToTry) {
    const provider = createProviderForTier(tier, {
      provider: providerName !== "unknown" ? providerName : undefined,
    });
    if (!provider) continue;

    const resilient = wrapWithResilience(provider, providerName, feature);

    try {
      return await resilient.complete(request);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof CircuitOpenError) {
        console.warn(
          `[ai-router] ${feature}: circuit open for ${providerName}, skipping tier "${tier}"`
        );
      } else {
        console.warn(
          `[ai-router] ${feature} failed on tier "${tier}" (${provider.modelId}): ${msg}. Trying fallback...`
        );
      }
      continue;
    }
  }

  console.error(`[ai-router] ${feature}: all tiers exhausted, no response.`);
  return null;
}

// Re-export for dashboard
export { getAllProviderHealth };
export type { ProviderHealthStatus };
