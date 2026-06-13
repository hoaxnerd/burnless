import { describe, expect, it } from "vitest";
import { defaultBaseUrl, isKnownKind, PROVIDER_KINDS } from "../local/ai-catalog";

describe("provider catalog", () => {
  it("lists the 8 known kinds", () => {
    expect(PROVIDER_KINDS).toEqual([
      "anthropic", "openai", "openrouter", "ollama", "google", "mistral", "groq", "openai-compatible",
    ]);
  });
  it("validates kinds", () => {
    expect(isKnownKind("openrouter")).toBe(true);
    expect(isKnownKind("nonsense")).toBe(false);
  });
  it("prefills base URLs for the providers that need them", () => {
    expect(defaultBaseUrl("openrouter")).toBe("https://openrouter.ai/api/v1");
    expect(defaultBaseUrl("ollama")).toBe("http://localhost:11434/v1");
    expect(defaultBaseUrl("anthropic")).toBeUndefined();
  });
});
