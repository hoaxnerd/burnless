import { describe, it, expect } from "vitest";
import { resolveProviderSpec } from "../providers/ai-sdk-provider";

describe("resolveProviderSpec", () => {
  it("maps anthropic to the anthropic sdk, passing apiKey/baseUrl/model", () => {
    const spec = resolveProviderSpec("anthropic", {
      apiKey: "sk-ant", model: "claude-sonnet-4-20250514", baseUrl: undefined, maxTokens: 4096,
    });
    expect(spec).toEqual({ sdk: "anthropic", apiKey: "sk-ant", baseURL: undefined, modelId: "claude-sonnet-4-20250514", headers: undefined });
  });

  it("maps openai to the openai sdk", () => {
    const spec = resolveProviderSpec("openai", { apiKey: "sk", model: "gpt-4o", maxTokens: 4096 });
    expect(spec).toMatchObject({ sdk: "openai", apiKey: "sk", modelId: "gpt-4o" });
  });

  it("maps openrouter to openai-compatible with the openrouter base url", () => {
    const spec = resolveProviderSpec("openrouter", { apiKey: "sk-or", model: "anthropic/claude-sonnet-4-20250514", maxTokens: 4096 });
    expect(spec).toMatchObject({ sdk: "openai-compatible", apiKey: "sk-or", baseURL: "https://openrouter.ai/api/v1", modelId: "anthropic/claude-sonnet-4-20250514" });
  });

  it("maps ollama to openai-compatible with a dummy key + localhost default", () => {
    const spec = resolveProviderSpec("ollama", { apiKey: "", model: "gemma4:26b", maxTokens: 4096 });
    expect(spec).toMatchObject({ sdk: "openai-compatible", apiKey: "ollama", baseURL: "http://localhost:11434/v1", modelId: "gemma4:26b" });
  });

  it("treats an unknown kind as a generic openai-compatible endpoint, honoring explicit baseUrl", () => {
    const spec = resolveProviderSpec("openai-compatible", { apiKey: "k", model: "mymodel", baseUrl: "http://localhost:1234/v1", maxTokens: 4096 });
    expect(spec).toMatchObject({ sdk: "openai-compatible", apiKey: "k", baseURL: "http://localhost:1234/v1", modelId: "mymodel" });
  });
});
