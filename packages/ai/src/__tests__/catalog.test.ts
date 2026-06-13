import { describe, it, expect } from "vitest";
import { PROVIDER_CATALOG, listCatalogKinds, getCatalogEntry } from "../catalog";
import { createProvider } from "../providers";

describe("PROVIDER_CATALOG", () => {
  it("has an entry for every supported kind incl. the escape hatch", () => {
    expect(listCatalogKinds()).toEqual(expect.arrayContaining([
      "anthropic","openai","openrouter","ollama","google","mistral","groq","openai-compatible",
    ]));
  });
  it("openrouter/ollama base URLs match the P1 resolveProviderSpec constants", () => {
    expect(getCatalogEntry("openrouter")?.defaultBaseUrl).toBe("https://openrouter.ai/api/v1");
    expect(getCatalogEntry("ollama")?.defaultBaseUrl).toBe("http://localhost:11434/v1");
  });
  it("marks which kinds expose an OpenAI-style /v1/models discovery endpoint", () => {
    expect(getCatalogEntry("openai")?.supportsModelDiscovery).toBe(true);
    expect(getCatalogEntry("openrouter")?.supportsModelDiscovery).toBe(true);
    expect(getCatalogEntry("anthropic")?.supportsModelDiscovery).toBe(false);
    expect(getCatalogEntry("anthropic")?.knownModels?.length).toBeGreaterThan(0);
  });
  it("openai-compatible is the generic escape hatch (no fixed base URL, custom flag)", () => {
    const e = getCatalogEntry("openai-compatible");
    expect(e?.defaultBaseUrl).toBeUndefined();
    expect(e?.custom).toBe(true);
  });
});

describe("createProvider × PROVIDER_CATALOG", () => {
  // Regression: PROVIDER_MAP previously only registered 4 of the 8 catalog
  // kinds, so a validly-configured google/mistral/groq/openai-compatible
  // provider hit `PROVIDER_MAP[kind] === undefined` → "Unknown provider" → null
  // → AI silently degraded. Every catalog kind must build a non-null provider.
  it("builds a non-null provider for every catalog kind", () => {
    for (const kind of listCatalogKinds()) {
      const p = createProvider({
        provider: kind,
        apiKey: kind === "ollama" ? undefined : "test-key",
        model: "test-model",
        baseUrl: kind === "openai-compatible" ? "https://x/v1" : undefined,
      });
      expect(p, `kind ${kind} should build`).not.toBeNull();
    }
  });
});
