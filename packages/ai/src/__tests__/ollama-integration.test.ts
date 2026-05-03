/**
 * Integration tests for the AI package against a real Ollama instance.
 *
 * These tests require Ollama running locally with the gemma3:12b model.
 * They exercise the actual provider, chat, streaming, and page insights
 * paths end-to-end — no mocks.
 *
 * Run: AI_PROVIDER=ollama OLLAMA_BASE_URL=http://localhost:11434/v1 pnpm test -- ollama-integration
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createProvider, resetProvider, OpenAIProvider } from "../providers";
import { chat, chatStream } from "../chat";
import { generatePageInsights, type PageInsightContext } from "../page-insights";
import type { StreamChunk } from "../types";
import type { FinancialSnapshot } from "../types";

// ── Helpers ──────────────────────────────────────────────────────────────────

const OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";
const MODEL = process.env.AI_MODEL ?? "gemma3:12b";
const TIMEOUT = 120_000; // Ollama can be slow on first load

/** Check if Ollama is reachable. */
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

/** Minimal financial snapshot for testing. */
function makeTestSnapshot(): FinancialSnapshot {
  return {
    company: {
      name: "TestCo",
      stage: "seed",
      businessModel: "saas",
      industry: null,
      currency: "USD",
    },
    scenario: {
      id: "s1",
      name: "Base Case",
      source: "blank",
    },
    period: {
      start: "2025-10",
      end: "2025-12",
      currentMonth: "2025-12",
    },
    keyMetrics: {
      mrr: 15000,
      arr: 180000,
      burnRate: 45000,
      netBurn: 30000,
      runway: 12.5,
      cashPosition: 375000,
      revenueGrowth: 15,
      grossMargin: 85,
      headcount: 8,
      ltv: 6400,
      cac: 2000,
      ltvCacRatio: 3.2,
      churnRate: 3.5,
    },
    revenueByMonth: [
      { month: "2025-10", amount: 11000 },
      { month: "2025-11", amount: 13000 },
      { month: "2025-12", amount: 15000 },
    ],
    expensesByMonth: [
      { month: "2025-10", amount: 40000 },
      { month: "2025-11", amount: 42000 },
      { month: "2025-12", amount: 45000 },
    ],
    cashByMonth: [
      { month: "2025-10", amount: 425000 },
      { month: "2025-11", amount: 396000 },
      { month: "2025-12", amount: 375000 },
    ],
    headcountByMonth: [
      { month: "2025-10", count: 7 },
      { month: "2025-11", count: 8 },
      { month: "2025-12", count: 8 },
    ],
    profitAndLoss: {
      totalRevenue: 39000,
      totalCogs: 5850,
      grossProfit: 33150,
      totalOpex: 127000,
      netIncome: -93850,
    },
    fundingRounds: [],
    scenarios: [
      { id: "s1", name: "Base Case", source: "blank", status: "active" },
    ],
    accounts: [],
    departments: [],
    expenses: [],
  };
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe("Ollama Integration Tests", () => {
  let ollamaAvailable = false;

  beforeAll(async () => {
    ollamaAvailable = await isOllamaReachable();
    if (!ollamaAvailable) {
      console.warn("⚠ Ollama not reachable — skipping integration tests");
    }
    // Reset singleton so it picks up env vars
    resetProvider();
  });

  afterAll(() => {
    resetProvider();
  });

  // ── 1. Provider initialization ─────────────────────────────────────────

  describe("Provider", () => {
    it("creates an Ollama provider (OpenAI-compatible)", () => {
      if (!ollamaAvailable) return;

      const provider = createProvider({
        provider: "ollama",
        model: MODEL,
        baseUrl: OLLAMA_URL,
      });

      expect(provider).not.toBeNull();
      expect(provider).toBeInstanceOf(OpenAIProvider);
    });

    it("creates provider without explicit API key", () => {
      if (!ollamaAvailable) return;

      const provider = createProvider({
        provider: "ollama",
        model: MODEL,
      });

      expect(provider).not.toBeNull();
    });
  });

  // ── 2. Non-streaming chat ──────────────────────────────────────────────

  describe("Chat (non-streaming)", () => {
    it(
      "returns a coherent response to a simple question",
      async () => {
        if (!ollamaAvailable) return;

        const result = await chat({
          messages: [{ role: "user", content: "What is 2+2? Answer with just the number." }],
          financialContext: "",
          providerConfig: {
            provider: "ollama",
            apiKey: "ollama",
            model: MODEL,
            baseUrl: OLLAMA_URL,
          },
        });

        expect(result.response).toBeTruthy();
        expect(result.response.length).toBeGreaterThan(0);
        // The response should contain "4" somewhere
        expect(result.response).toContain("4");
      },
      TIMEOUT
    );

    it(
      "uses financial context in its response",
      async () => {
        if (!ollamaAvailable) return;

        const result = await chat({
          messages: [
            {
              role: "user",
              content:
                "What is my company's monthly burn rate? Give me just the number.",
            },
          ],
          financialContext:
            "Company: TestCo\nMonthly Burn Rate: $45,000\nRunway: 12.5 months\nMRR: $15,000",
          providerConfig: {
            provider: "ollama",
            apiKey: "ollama",
            model: MODEL,
            baseUrl: OLLAMA_URL,
          },
        });

        expect(result.response).toBeTruthy();
        // The model should reference $45,000 or 45000 from the context
        expect(result.response).toMatch(/45[,.]?000/);
      },
      TIMEOUT
    );

    it(
      "returns unconfigured message when provider is null",
      async () => {
        // Save and clear env vars so no fallback provider is created
        const savedProvider = process.env.AI_PROVIDER;
        const savedOllamaUrl = process.env.OLLAMA_BASE_URL;
        const savedAnthropicKey = process.env.ANTHROPIC_API_KEY;
        delete process.env.AI_PROVIDER;
        delete process.env.OLLAMA_BASE_URL;
        delete process.env.ANTHROPIC_API_KEY;
        resetProvider();

        try {
          const result = await chat({
            messages: [{ role: "user", content: "Hello" }],
            financialContext: "",
          });

          // Should gracefully return not-configured message
          expect(result.response).toContain("not configured");
        } finally {
          // Restore env
          if (savedProvider) process.env.AI_PROVIDER = savedProvider;
          if (savedOllamaUrl) process.env.OLLAMA_BASE_URL = savedOllamaUrl;
          if (savedAnthropicKey) process.env.ANTHROPIC_API_KEY = savedAnthropicKey;
          resetProvider();
        }
      },
      TIMEOUT
    );
  });

  // ── 3. Streaming chat ─────────────────────────────────────────────────

  describe("Chat (streaming)", () => {
    it(
      "streams text chunks and ends with done",
      async () => {
        if (!ollamaAvailable) return;

        const chunks: StreamChunk[] = [];
        for await (const chunk of chatStream({
          messages: [
            { role: "user", content: "Say hello in exactly 3 words." },
          ],
          financialContext: "",
          providerConfig: {
            provider: "ollama",
            apiKey: "ollama",
            model: MODEL,
            baseUrl: OLLAMA_URL,
          },
        })) {
          chunks.push(chunk);
        }

        // Must have at least one text chunk and a done chunk
        const textChunks = chunks.filter((c) => c.type === "text");
        const doneChunks = chunks.filter((c) => c.type === "done");

        expect(textChunks.length).toBeGreaterThanOrEqual(1);
        expect(doneChunks).toHaveLength(1);

        // Concatenate all text
        const fullText = textChunks
          .map((c) => (c as { type: "text"; content: string }).content)
          .join("");
        expect(fullText.length).toBeGreaterThan(0);
      },
      TIMEOUT
    );

    it(
      "streams with financial context",
      async () => {
        if (!ollamaAvailable) return;

        const chunks: StreamChunk[] = [];
        for await (const chunk of chatStream({
          messages: [
            { role: "user", content: "What is my runway? Answer in one sentence." },
          ],
          financialContext:
            "Company: TestCo\nCash: $375,000\nBurn Rate: $30,000/month\nRunway: 12.5 months",
          providerConfig: {
            provider: "ollama",
            apiKey: "ollama",
            model: MODEL,
            baseUrl: OLLAMA_URL,
          },
        })) {
          chunks.push(chunk);
        }

        const fullText = chunks
          .filter((c) => c.type === "text")
          .map((c) => (c as { type: "text"; content: string }).content)
          .join("");

        expect(fullText).toBeTruthy();
        // Should mention runway or months
        expect(fullText.toLowerCase()).toMatch(/runway|month/);
      },
      TIMEOUT
    );
  });

  // ── 4. Page Insights ──────────────────────────────────────────────────

  describe("Page Insights", () => {
    it(
      "generates expense page insights",
      async () => {
        if (!ollamaAvailable) return;

        const context: PageInsightContext = {
          page: "expenses",
          snapshot: makeTestSnapshot(),
          providerConfig: {
            provider: "ollama",
            apiKey: "ollama",
            model: MODEL,
            baseUrl: OLLAMA_URL,
          },
        };

        const insights = await generatePageInsights(context);

        // Should return 0-3 insights (may be 0 if LLM returns invalid JSON)
        expect(Array.isArray(insights)).toBe(true);
        expect(insights.length).toBeLessThanOrEqual(3);

        if (insights.length > 0) {
          // Each insight should have required fields
          for (const insight of insights) {
            expect(insight.title).toBeTruthy();
            expect(insight.summary).toBeTruthy();
            expect(["info", "warning", "critical"]).toContain(insight.severity);
          }
        }
      },
      TIMEOUT
    );

    it(
      "generates revenue page insights",
      async () => {
        if (!ollamaAvailable) return;

        const context: PageInsightContext = {
          page: "revenue",
          snapshot: makeTestSnapshot(),
          pageData: {
            growthMetrics: {
              currentMrr: 15000,
              mrrGrowthPercent: 15,
              arr: 180000,
              churnRate: 3.5,
              ltv: 6400,
              quickRatio: 4.2,
              doublingTimeMonths: 5,
              totalCustomers: 120,
            },
            streamBreakdown: [
              {
                name: "Pro Plan",
                type: "subscription",
                currentRevenue: 12000,
                percentage: 80,
                changePercent: 0.12,
              },
              {
                name: "Enterprise",
                type: "subscription",
                currentRevenue: 3000,
                percentage: 20,
                changePercent: 0.25,
              },
            ],
          },
          providerConfig: {
            provider: "ollama",
            apiKey: "ollama",
            model: MODEL,
            baseUrl: OLLAMA_URL,
          },
        };

        const insights = await generatePageInsights(context);

        expect(Array.isArray(insights)).toBe(true);
        expect(insights.length).toBeLessThanOrEqual(3);
      },
      TIMEOUT
    );

    it(
      "generates scenarios page insights",
      async () => {
        if (!ollamaAvailable) return;

        const context: PageInsightContext = {
          page: "scenarios",
          snapshot: makeTestSnapshot(),
          providerConfig: {
            provider: "ollama",
            apiKey: "ollama",
            model: MODEL,
            baseUrl: OLLAMA_URL,
          },
        };

        const insights = await generatePageInsights(context);

        expect(Array.isArray(insights)).toBe(true);
        expect(insights.length).toBeLessThanOrEqual(3);
      },
      TIMEOUT
    );

    it(
      "returns empty array when provider is unavailable",
      async () => {
        // Save and clear env vars so no fallback provider is created
        const savedProvider = process.env.AI_PROVIDER;
        const savedOllamaUrl = process.env.OLLAMA_BASE_URL;
        const savedAnthropicKey = process.env.ANTHROPIC_API_KEY;
        delete process.env.AI_PROVIDER;
        delete process.env.OLLAMA_BASE_URL;
        delete process.env.ANTHROPIC_API_KEY;
        resetProvider();

        try {
          const context: PageInsightContext = {
            page: "expenses",
            snapshot: makeTestSnapshot(),
          };

          const insights = await generatePageInsights(context);
          expect(insights).toEqual([]);
        } finally {
          if (savedProvider) process.env.AI_PROVIDER = savedProvider;
          if (savedOllamaUrl) process.env.OLLAMA_BASE_URL = savedOllamaUrl;
          if (savedAnthropicKey) process.env.ANTHROPIC_API_KEY = savedAnthropicKey;
          resetProvider();
        }
      },
      TIMEOUT
    );
  });

  // ── 5. Provider resilience ────────────────────────────────────────────

  describe("Resilience", () => {
    it("handles invalid model gracefully", async () => {
      if (!ollamaAvailable) return;

      try {
        const result = await chat({
          messages: [{ role: "user", content: "Hello" }],
          financialContext: "",
          providerConfig: {
            provider: "ollama",
            apiKey: "ollama",
            model: "nonexistent-model-12345",
            baseUrl: OLLAMA_URL,
          },
        });
        // If it doesn't throw, the response should indicate an error
        // (depends on Ollama error handling)
        expect(result.response).toBeDefined();
      } catch (err) {
        // Should throw a meaningful error, not crash silently
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toBeTruthy();
      }
    });

    it("handles unreachable Ollama gracefully", async () => {
      try {
        const result = await chat({
          messages: [{ role: "user", content: "Hello" }],
          financialContext: "",
          providerConfig: {
            provider: "ollama",
            apiKey: "ollama",
            model: MODEL,
            baseUrl: "http://localhost:99999/v1",
          },
        });
        expect(result.response).toBeDefined();
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
      }
    });
  });

  // ── 6. Response timing ────────────────────────────────────────────────

  describe("Performance", () => {
    it(
      "responds within 30 seconds for a simple query",
      async () => {
        if (!ollamaAvailable) return;

        const start = Date.now();
        await chat({
          messages: [
            { role: "user", content: "What is 1+1? Answer with just the number." },
          ],
          financialContext: "",
          providerConfig: {
            provider: "ollama",
            apiKey: "ollama",
            model: MODEL,
            baseUrl: OLLAMA_URL,
          },
        });
        const elapsed = Date.now() - start;

        // Should respond within 30 seconds
        expect(elapsed).toBeLessThan(30_000);
        console.log(`[perf] Simple query response time: ${(elapsed / 1000).toFixed(1)}s`);
      },
      TIMEOUT
    );

    it(
      "first streaming chunk arrives within 10 seconds",
      async () => {
        if (!ollamaAvailable) return;

        const start = Date.now();
        let firstChunkTime: number | null = null;

        for await (const chunk of chatStream({
          messages: [{ role: "user", content: "Count from 1 to 5." }],
          financialContext: "",
          providerConfig: {
            provider: "ollama",
            apiKey: "ollama",
            model: MODEL,
            baseUrl: OLLAMA_URL,
          },
        })) {
          if (chunk.type === "text" && firstChunkTime === null) {
            firstChunkTime = Date.now() - start;
          }
          if (chunk.type === "done") break;
        }

        expect(firstChunkTime).not.toBeNull();
        expect(firstChunkTime!).toBeLessThan(10_000);
        console.log(`[perf] First streaming chunk: ${(firstChunkTime! / 1000).toFixed(1)}s`);
      },
      TIMEOUT
    );
  });
});
