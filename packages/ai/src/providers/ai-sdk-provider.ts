/**
 * AiSdkProvider — the single LlmProvider implementation, backed by the Vercel AI SDK.
 *
 * All Vercel AI SDK usage is confined to this file. Application code (chat.ts, etc.)
 * speaks only our neutral types. To add a provider, add a `kind` to the catalog (P2);
 * the OpenAI-compatible escape hatch already covers any OpenAI-shaped endpoint.
 */
import type { ProviderConfig } from "./types";

export type SdkKind = "anthropic" | "openai" | "openai-compatible";

export interface ProviderSpec {
  sdk: SdkKind;
  apiKey?: string;
  baseURL?: string;
  modelId: string;
  headers?: Record<string, string>;
}

/** OpenAI-compatible base URLs for known kinds (preserves the pre-AI-SDK factory behavior). */
const OPENAI_COMPAT_BASE_URLS: Record<string, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  ollama: "http://localhost:11434/v1",
};

/**
 * Pure: map a provider kind + our ProviderConfig to which AI-SDK family to instantiate.
 * anthropic/openai use their first-party packages; everything else (openrouter, ollama,
 * openai-compatible, or any unknown kind) uses the OpenAI-compatible escape hatch.
 */
export function resolveProviderSpec(kind: string, config: ProviderConfig): ProviderSpec {
  const headers = config.extra?.headers as Record<string, string> | undefined;
  if (kind === "anthropic") {
    return { sdk: "anthropic", apiKey: config.apiKey, baseURL: config.baseUrl, modelId: config.model, headers };
  }
  if (kind === "openai") {
    return { sdk: "openai", apiKey: config.apiKey, baseURL: config.baseUrl, modelId: config.model, headers };
  }
  const baseURL =
    config.baseUrl ??
    (kind === "ollama" ? process.env.OLLAMA_BASE_URL ?? OPENAI_COMPAT_BASE_URLS.ollama : OPENAI_COMPAT_BASE_URLS[kind]);
  // Ollama ignores the key but the SDK requires a non-empty one.
  const apiKey = config.apiKey || (kind === "ollama" ? "ollama" : config.apiKey);
  return { sdk: "openai-compatible", apiKey, baseURL, modelId: config.model, headers };
}
