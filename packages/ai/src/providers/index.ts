/**
 * Provider factory — resolves which LLM provider to use based on configuration.
 *
 * Configuration hierarchy:
 *   1. Explicit config passed to createProvider()
 *   2. Environment variables (AI_PROVIDER, AI_MODEL, AI_API_KEY, AI_BASE_URL)
 *   3. Legacy env vars (ANTHROPIC_API_KEY → Anthropic provider)
 *   4. Defaults (Anthropic + claude-sonnet-4-20250514)
 *
 * To add a new provider:
 *   1. Create providers/<name>.ts implementing LlmProvider
 *   2. Add it to PROVIDER_MAP below
 *   3. Done — users can switch via AI_PROVIDER=<name>
 */

import type { LlmProvider } from "./base";
import type { ProviderConfig } from "./types";
import { AnthropicProvider } from "./anthropic";

// ── Provider registry ───────────────────────────────────────────────────────

type ProviderFactory = (config: ProviderConfig) => LlmProvider;

const PROVIDER_MAP: Record<string, ProviderFactory> = {
  anthropic: (config) => new AnthropicProvider(config),
  // Future providers:
  // openai: (config) => new OpenAIProvider(config),
  // openrouter: (config) => new OpenRouterProvider(config),
  // gemini: (config) => new GeminiProvider(config),
};

// ── Default models per provider ─────────────────────────────────────────────

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-20250514",
  // openai: "gpt-4o",
  // openrouter: "anthropic/claude-sonnet-4-20250514",
  // gemini: "gemini-2.0-flash",
};

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
    "anthropic";

  const factory = PROVIDER_MAP[providerName];
  if (!factory) {
    console.warn(
      `[ai] Unknown provider "${providerName}". Available: ${Object.keys(PROVIDER_MAP).join(", ")}`
    );
    return null;
  }

  const apiKey =
    options.apiKey ??
    process.env.AI_API_KEY ??
    (providerName === "anthropic" ? process.env.ANTHROPIC_API_KEY : undefined) ??
    (providerName === "openai" ? process.env.OPENAI_API_KEY : undefined);

  if (!apiKey) {
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
export { AnthropicProvider } from "./anthropic";
export { LlmProvider } from "./base";
export type {
  ProviderConfig,
  CompletionRequest,
  LlmResponse,
  StreamEvent,
  ContentBlock,
  ToolDefinition,
  LlmMessage,
  StopReason,
} from "./types";
