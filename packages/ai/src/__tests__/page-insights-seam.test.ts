/**
 * A5 — generatePageInsights routes EVERY real generation through THE seam
 * (resolveResilientProvider) so it gets resilience (retry, which recovers
 * transient empty completions) + usage tracking + logging, and so the company
 * providerConfig is honoured without page-insights knowing how it was sourced.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FinancialSnapshot } from "../types";

const resolveResilientProvider = vi.fn();
vi.mock("../routing", () => ({ resolveResilientProvider }));

const { generatePageInsights } = await import("../page-insights");

function makeSnapshot(): FinancialSnapshot {
  return {
    company: { name: "Acme", stage: "seed", businessModel: "SaaS", industry: "Software", currency: "USD", locale: "en-US" },
    scenario: { id: "s1", name: "Base", source: "manual" },
    period: { start: "2026-01-01", end: "2026-12-31", currentMonth: "2026-06" },
    keyMetrics: {
      mrr: 50000, arr: 600000, burnRate: 80000, netBurn: 30000, runway: 18, cashPosition: 1440000,
      revenueGrowth: 5.2, grossMargin: 72, headcount: 12, ltv: 24000, cac: 4000, ltvCacRatio: 6, churnRate: 2.1,
    },
  } as unknown as FinancialSnapshot;
}

beforeEach(() => resolveResilientProvider.mockReset());

describe("generatePageInsights routes through the seam", () => {
  it("calls resolveResilientProvider with the page_insights feature and the providerConfig", async () => {
    resolveResilientProvider.mockReturnValue({
      modelId: "m",
      generateText: vi.fn(async () => JSON.stringify([{ title: "Cut burn", summary: "Trim cloud spend." }])),
    });

    const cfg = { provider: "openrouter", apiKey: "sk-x", model: "google/gemini-2.5-flash-lite" };
    const insights = await generatePageInsights({ page: "dashboard", snapshot: makeSnapshot(), providerConfig: cfg });

    expect(resolveResilientProvider).toHaveBeenCalledWith("page_insights", cfg);
    expect(insights).toHaveLength(1);
    expect(insights[0]?.title).toBe("Cut burn");
  });

  it("returns [] gracefully when the seam yields no provider", async () => {
    resolveResilientProvider.mockReturnValue(null);
    const insights = await generatePageInsights({ page: "dashboard", snapshot: makeSnapshot() });
    expect(resolveResilientProvider).toHaveBeenCalledWith("page_insights", undefined);
    expect(insights).toEqual([]);
  });
});
