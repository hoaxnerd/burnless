/**
 * Minimal provider catalog for the CLI — kind list + default base URLs. A deliberate
 * small mirror of @burnless/ai's PROVIDER_CATALOG (importing that barrel would pull the
 * whole AI SDK into the CLI). Source of truth = packages/ai/src/catalog.ts; keep in sync.
 */
export const PROVIDER_KINDS = [
  "anthropic",
  "openai",
  "openrouter",
  "ollama",
  "google",
  "mistral",
  "groq",
  "openai-compatible",
] as const;

export type ProviderKind = (typeof PROVIDER_KINDS)[number];

const DEFAULT_BASE_URLS: Partial<Record<ProviderKind, string>> = {
  openrouter: "https://openrouter.ai/api/v1",
  ollama: "http://localhost:11434/v1",
};

export function isKnownKind(kind: string): kind is ProviderKind {
  return (PROVIDER_KINDS as readonly string[]).includes(kind);
}

export function defaultBaseUrl(kind: ProviderKind): string | undefined {
  return DEFAULT_BASE_URLS[kind];
}
