/**
 * Provider catalog (P2) — the CODE half of provider knowledge (spec §2).
 * Base URLs MUST match resolveProviderSpec in providers/ai-sdk-provider.ts so
 * DB-config and env-config resolve identically.
 */
export type ProviderKind =
  | "anthropic" | "openai" | "openrouter" | "ollama"
  | "google" | "mistral" | "groq" | "openai-compatible";
export type AuthStyle = "api_key" | "none";
export interface PresetEntry {
  kind: ProviderKind;
  label: string;
  defaultBaseUrl?: string;
  authStyle: AuthStyle;
  /** True when GET {baseUrl}/v1/models works (OpenAI-shaped). */
  supportsModelDiscovery: boolean;
  /** Fallback model ids when discovery is unavailable (e.g. Anthropic). */
  knownModels?: string[];
  /** True for the generic user-defined endpoint (no preset base URL). */
  custom?: boolean;
}
export const PROVIDER_CATALOG: Record<ProviderKind, PresetEntry> = {
  anthropic: { kind: "anthropic", label: "Anthropic", authStyle: "api_key", supportsModelDiscovery: false,
    knownModels: ["claude-opus-4-8","claude-sonnet-4-6","claude-sonnet-4-20250514","claude-haiku-4-5-20251001"] },
  openai: { kind: "openai", label: "OpenAI", authStyle: "api_key", supportsModelDiscovery: true },
  openrouter: { kind: "openrouter", label: "OpenRouter", defaultBaseUrl: "https://openrouter.ai/api/v1", authStyle: "api_key", supportsModelDiscovery: true },
  ollama: { kind: "ollama", label: "Ollama (local)", defaultBaseUrl: "http://localhost:11434/v1", authStyle: "none", supportsModelDiscovery: true },
  google: { kind: "google", label: "Google Gemini", defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", authStyle: "api_key", supportsModelDiscovery: true },
  mistral: { kind: "mistral", label: "Mistral", defaultBaseUrl: "https://api.mistral.ai/v1", authStyle: "api_key", supportsModelDiscovery: true },
  groq: { kind: "groq", label: "Groq", defaultBaseUrl: "https://api.groq.com/openai/v1", authStyle: "api_key", supportsModelDiscovery: true },
  "openai-compatible": { kind: "openai-compatible", label: "Custom · OpenAI-compatible", authStyle: "api_key", supportsModelDiscovery: true, custom: true },
};
export function listCatalogKinds(): ProviderKind[] {
  return Object.keys(PROVIDER_CATALOG) as ProviderKind[];
}
export function getCatalogEntry(kind: string): PresetEntry | undefined {
  return PROVIDER_CATALOG[kind as ProviderKind];
}
