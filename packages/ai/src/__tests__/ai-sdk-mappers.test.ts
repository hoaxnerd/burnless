import { describe, it, expect } from "vitest";
import { resolveProviderSpec } from "../providers/ai-sdk-provider";
import { toModelMessages } from "../providers/ai-sdk-provider";
import { toAiSdkTools, mapFinishReason, fromContentParts } from "../providers/ai-sdk-provider";
import { streamPartToEvent } from "../providers/ai-sdk-provider";
import type { LlmMessage, ToolDefinition } from "../providers/types";

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

describe("toAiSdkTools", () => {
  it("wraps each tool's JSON schema and carries description, with no execute fn", () => {
    const tools: ToolDefinition[] = [
      { name: "get_metrics", description: "Get metrics", inputSchema: { type: "object", properties: { period: { type: "string" } }, required: ["period"] } },
    ];
    const set = toAiSdkTools(tools);
    expect(Object.keys(set)).toEqual(["get_metrics"]);
    const t = set.get_metrics;
    expect(t).toBeDefined();
    expect(t!.description).toBe("Get metrics");
    expect(t!.execute).toBeUndefined();
    expect(t!.inputSchema).toBeDefined();
  });
});

describe("mapFinishReason", () => {
  it("maps AI-SDK finish reasons to our StopReason", () => {
    expect(mapFinishReason("stop")).toBe("end_turn");
    expect(mapFinishReason("tool-calls")).toBe("tool_use");
    expect(mapFinishReason("length")).toBe("max_tokens");
    expect(mapFinishReason("content-filter")).toBe("unknown");
  });
});

describe("fromContentParts", () => {
  it("maps text + tool-call parts to our ContentBlock[], skipping others", () => {
    const parts = [
      { type: "text", text: "here" },
      { type: "reasoning", text: "thinking" },
      { type: "tool-call", toolCallId: "c1", toolName: "get_metrics", input: { period: "2026-01" } },
    ];
    expect(fromContentParts(parts)).toEqual([
      { type: "text", text: "here" },
      { type: "tool_use", id: "c1", name: "get_metrics", input: { period: "2026-01" } },
    ]);
  });
});

describe("streamPartToEvent", () => {
  it("maps text-delta to text_delta", () => {
    expect(streamPartToEvent({ type: "text-delta", text: "hi" })).toEqual({ type: "text_delta", text: "hi" });
  });
  it("maps reasoning-delta to thinking_delta", () => {
    expect(streamPartToEvent({ type: "reasoning-delta", text: "hmm" })).toEqual({ type: "thinking_delta", text: "hmm" });
  });
  it("maps tool-call to tool_use", () => {
    expect(streamPartToEvent({ type: "tool-call", toolCallId: "c1", toolName: "get_metrics", input: { a: 1 } }))
      .toEqual({ type: "tool_use", id: "c1", name: "get_metrics", input: { a: 1 } });
  });
  it("returns null for parts we do not surface (finish/start/etc.)", () => {
    expect(streamPartToEvent({ type: "finish", finishReason: "stop" })).toBeNull();
    expect(streamPartToEvent({ type: "text-start" })).toBeNull();
  });
});
