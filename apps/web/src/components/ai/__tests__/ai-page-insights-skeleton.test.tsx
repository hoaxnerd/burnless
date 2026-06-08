/**
 * RPT-13: AiPageInsights renders cached insights first (no skeleton when cache
 * is present) and, while genuinely loading with no cache, shows a COMPACT
 * skeleton — a single slim placeholder row, not the old 3-card block that
 * dominated the Board Update for ~5s.
 *
 * Also asserts the existing stale de-emphasis behavior is preserved.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { cacheState } = vi.hoisted(() => ({
  cacheState: { current: {} as Record<string, unknown> },
}));

vi.mock("../use-insight-cache", () => ({
  useInsightCache: () => cacheState.current,
}));

vi.mock("../ai-feature-context", () => ({
  useAiFeature: () => ({ enabled: true, loaded: true }),
  useAiFlags: () => ({ credits: { exceeded: false } }),
}));

vi.mock("@/components/providers/page-layout-context", () => ({
  useOptionalPageLayout: () => null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("../ai-gate", () => ({
  AiGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../markdown-renderer", () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <span data-testid="summary">{content}</span>,
}));

vi.mock("../stale-insight-banner", () => ({
  StaleInsightBanner: () => <div data-testid="stale-banner" />,
}));

import { AiPageInsights } from "../ai-page-insights";

const INSIGHT = {
  type: "financial_narrative",
  title: "Revenue grew 12%",
  summary: "Revenue is up **12%** MoM.",
  severity: "info" as const,
};

function baseCache(overrides: Record<string, unknown> = {}) {
  return {
    displayData: [],
    loading: false,
    error: false,
    refreshError: false,
    errorVariant: "generic",
    cached: false,
    cachedAt: null,
    stale: false,
    dataChanged: false,
    graceRemaining: null,
    canRefresh: true,
    staleReason: null,
    slow: false,
    autoRegenerating: false,
    settling: false,
    budgetExceeded: false,
    fetchCached: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  cacheState.current = baseCache();
});

describe("AiPageInsights compact skeleton (RPT-13)", () => {
  it("shows a COMPACT skeleton (single placeholder row) while settling with no data", () => {
    cacheState.current = baseCache({ settling: true, displayData: [], slow: false });
    const { container } = render(<AiPageInsights page="reports" />);

    // animate-pulse marks the skeleton container.
    const pulse = container.querySelector(".animate-pulse");
    expect(pulse).not.toBeNull();

    // Compact: exactly ONE placeholder insight card (the old skeleton had 3).
    const cards = pulse!.querySelectorAll(".rounded-xl");
    expect(cards.length).toBe(1);
  });

  it("renders cached insights FIRST (no skeleton) when cache is present", () => {
    cacheState.current = baseCache({ displayData: [INSIGHT], cached: true, cachedAt: new Date().toISOString(), settling: false });
    const { container } = render(<AiPageInsights page="reports" />);

    // The cached insight is shown.
    expect(screen.getByText("Revenue grew 12%")).toBeInTheDocument();
    // No skeleton.
    expect(container.querySelector(".animate-pulse")).toBeNull();
  });

  it("preserves stale de-emphasis on the cached insight (regression guard)", () => {
    cacheState.current = baseCache({
      displayData: [INSIGHT],
      cached: true,
      cachedAt: new Date().toISOString(),
      stale: true,
      dataChanged: true,
      staleReason: "revenue_edited",
    });
    render(<AiPageInsights page="reports" />);

    const summary = screen.getByTestId("summary");
    const wrapper = summary.parentElement!;
    expect(wrapper.className).toContain("opacity-60");
    expect(screen.getByText(/refresh for current figures/i)).toBeInTheDocument();
  });
});
