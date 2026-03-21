/**
 * Tool-calling integration tests — BUR-200
 *
 * Validates that the AI chat loop correctly handles tool calls with a real
 * local LLM (qwen3.5:9b via Ollama). This was previously blocked because
 * gemma3:12b doesn't support tool calling.
 *
 * Run: AI_PROVIDER=ollama AI_MODEL=qwen3.5:9b OLLAMA_BASE_URL=http://localhost:11434/v1 pnpm test -- tool-calling
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chat, chatStream } from "../chat";
import { resetProvider } from "../providers";
import type { StreamChunk } from "../types";

const OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";
const MODEL = process.env.AI_MODEL ?? "qwen3.5:9b";
const TIMEOUT = 120_000;

async function isOllamaReachable(): Promise<boolean> {
  try {
    const resp = await fetch("http://localhost:11434/api/tags", {
      signal: AbortSignal.timeout(5000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

describe("Tool Calling Integration (BUR-200)", () => {
  let ollamaAvailable = false;

  beforeAll(async () => {
    ollamaAvailable = await isOllamaReachable();
    if (!ollamaAvailable) {
      console.warn("⚠ Ollama not reachable — skipping tool-calling tests");
    }
    resetProvider();
  });

  afterAll(() => resetProvider());

  const providerConfig = {
    provider: "ollama",
    apiKey: "ollama",
    model: MODEL,
    baseUrl: OLLAMA_URL,
  };

  const financialContext = `Company: TestCo (SaaS, Seed stage)
Current Scenario: s-123 (Base Case)
MRR: $15,000 | ARR: $180,000 | Burn Rate: $45,000/mo | Runway: 12.5 months
Cash Position: $375,000
Headcount: 8

Chart of Accounts:
- acc-revenue (Revenue, income)
- acc-hosting (Hosting, operating_expense)
- acc-salaries (Salaries, operating_expense)`;

  describe("Non-streaming tool calls", () => {
    it(
      "invokes onToolCall when LLM requests a tool",
      async () => {
        if (!ollamaAvailable) return;

        const toolCalls: { name: string; input: Record<string, unknown> }[] = [];

        const result = await chat({
          messages: [
            {
              role: "user",
              content:
                "Create a new scenario called 'Aggressive Growth' with type 'best'. Use the create_scenario tool.",
            },
          ],
          financialContext,
          providerConfig,
          onToolCall: async (toolName, input) => {
            toolCalls.push({ name: toolName, input });
            return JSON.stringify({
              success: true,
              scenarioId: "new-s-456",
              name: input.name,
            });
          },
        });

        // LLM should have called create_scenario
        expect(toolCalls.length).toBeGreaterThanOrEqual(1);
        const createCall = toolCalls.find((c) => c.name === "create_scenario");
        expect(createCall).toBeDefined();
        expect(createCall!.input.name).toContain("Aggressive");
        expect(createCall!.input.type).toBe("best");

        // Response should reference the created scenario
        expect(result.response).toBeTruthy();
        expect(result.toolResults.length).toBeGreaterThanOrEqual(1);
      },
      TIMEOUT
    );

    it(
      "invokes compute_metrics tool when asked about financial metrics",
      async () => {
        if (!ollamaAvailable) return;

        const toolCalls: { name: string; input: Record<string, unknown> }[] = [];

        const result = await chat({
          messages: [
            {
              role: "user",
              content: "Compute the key financial metrics for the current scenario. Use the compute_metrics tool.",
            },
          ],
          financialContext,
          providerConfig,
          onToolCall: async (toolName, input) => {
            toolCalls.push({ name: toolName, input });
            return JSON.stringify({
              mrr: 15000,
              arr: 180000,
              burnRate: 45000,
              runway: 12.5,
              cashPosition: 375000,
            });
          },
        });

        expect(toolCalls.length).toBeGreaterThanOrEqual(1);
        expect(result.response).toBeTruthy();
      },
      TIMEOUT
    );

    it(
      "does NOT call tools when onToolCall is not provided",
      async () => {
        if (!ollamaAvailable) return;

        const result = await chat({
          messages: [
            { role: "user", content: "What is my current MRR?" },
          ],
          financialContext,
          providerConfig,
          // no onToolCall provided
        });

        // Should answer from context without tool calls
        expect(result.response).toBeTruthy();
        expect(result.toolResults).toEqual([]);
        expect(result.response).toMatch(/15[,.]?000/);
      },
      TIMEOUT
    );
  });

  describe("Streaming tool calls", () => {
    it(
      "yields tool_use and tool_result chunks in stream mode",
      async () => {
        if (!ollamaAvailable) return;

        const chunks: StreamChunk[] = [];
        const toolCalls: string[] = [];

        for await (const chunk of chatStream({
          messages: [
            {
              role: "user",
              content:
                "Create a scenario called 'Conservative' with type 'worst'. Use the create_scenario tool.",
            },
          ],
          financialContext,
          providerConfig,
          onToolCall: async (toolName, input) => {
            toolCalls.push(toolName);
            return JSON.stringify({
              success: true,
              scenarioId: "s-789",
              name: (input as Record<string, string>).name,
            });
          },
        })) {
          chunks.push(chunk);
        }

        // Should have tool_use and tool_result chunks if the LLM called a tool
        if (toolCalls.length > 0) {
          const toolUseChunks = chunks.filter((c) => c.type === "tool_use");
          const toolResultChunks = chunks.filter(
            (c) => c.type === "tool_result"
          );
          expect(toolUseChunks.length).toBeGreaterThanOrEqual(1);
          expect(toolResultChunks.length).toBeGreaterThanOrEqual(1);
        }

        // Must always end with done
        const doneChunks = chunks.filter((c) => c.type === "done");
        expect(doneChunks).toHaveLength(1);
      },
      TIMEOUT
    );
  });

  describe("Tool error handling", () => {
    it(
      "handles tool execution failure gracefully",
      async () => {
        if (!ollamaAvailable) return;

        const result = await chat({
          messages: [
            {
              role: "user",
              content:
                "Create a scenario called 'Error Test' with type 'custom'. Use the create_scenario tool.",
            },
          ],
          financialContext,
          providerConfig,
          onToolCall: async () => {
            return JSON.stringify({
              error: "Database connection failed",
              success: false,
            });
          },
        });

        // The LLM should handle the error result and respond appropriately
        expect(result.response).toBeTruthy();
        // It shouldn't crash
      },
      TIMEOUT
    );
  });
});
