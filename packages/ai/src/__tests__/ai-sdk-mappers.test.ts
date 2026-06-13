import { describe, it, expect } from "vitest";
import { resolveProviderSpec } from "../providers/ai-sdk-provider";
import { toModelMessages } from "../providers/ai-sdk-provider";
import type { LlmMessage } from "../providers/types";

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

  it("yields an openai-compatible spec with undefined baseURL for a truly unknown kind with no baseUrl", () => {
    const spec = resolveProviderSpec("acme-llm", { apiKey: "k", model: "acme-1", maxTokens: 4096 });
    expect(spec).toMatchObject({ sdk: "openai-compatible", apiKey: "k", baseURL: undefined, modelId: "acme-1" });
  });
});

describe("toModelMessages", () => {
  it("passes through plain string user/assistant messages and drops system-role entries", () => {
    const msgs: LlmMessage[] = [
      { role: "system", content: "ignored here" },
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ];
    expect(toModelMessages(msgs)).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ]);
  });

  it("maps an assistant tool_use block to a tool-call content part", () => {
    const msgs: LlmMessage[] = [
      { role: "assistant", content: [
        { type: "text", text: "calling" },
        { type: "tool_use", id: "call_1", name: "get_metrics", input: { period: "2026-01" } },
      ] },
    ];
    expect(toModelMessages(msgs)).toEqual([
      { role: "assistant", content: [
        { type: "text", text: "calling" },
        { type: "tool-call", toolCallId: "call_1", toolName: "get_metrics", input: { period: "2026-01" } },
      ] },
    ]);
  });

  it("maps a user tool_result block to a tool-role message, recovering toolName from the prior call", () => {
    const msgs: LlmMessage[] = [
      { role: "assistant", content: [
        { type: "tool_use", id: "call_1", name: "get_metrics", input: {} },
      ] },
      { role: "user", content: [
        { type: "tool_result", toolUseId: "call_1", content: "{\"mrr\":1000}" },
      ] },
    ];
    expect(toModelMessages(msgs)).toEqual([
      { role: "assistant", content: [
        { type: "tool-call", toolCallId: "call_1", toolName: "get_metrics", input: {} },
      ] },
      { role: "tool", content: [
        { type: "tool-result", toolCallId: "call_1", toolName: "get_metrics", output: { type: "text", value: "{\"mrr\":1000}" } },
      ] },
    ]);
  });
});
