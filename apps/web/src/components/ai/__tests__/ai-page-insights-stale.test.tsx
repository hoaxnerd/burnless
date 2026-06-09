// Cluster D + AI-07: when an insight is stale, AiPageInsights de-emphasizes the
// summary figures (opacity, screen-reader-visible) and shows a "refresh for
// current figures" note. Founder decision #12: NO auto-refresh — the manual
// Refresh button is the only path that spends credits.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ── Hoisted mock state for the insight cache ─────────────────────────────────
const { cacheState, refreshSpy } = vi.hoisted(() => ({
  cacheState: { current: {} as Record<string, unknown> },
  refreshSpy: vi.fn(),
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

const STALE_INSIGHT = {
  type: "runway_alert",
  title: "Runway is 8 months",
  summary: "Your runway is **8 months** at the current burn.",
  severity: "warning" as const,
};

function baseCache(overrides: Record<string, unknown> = {}) {
  return {
    displayData: [STALE_INSIGHT],
    loading: false,
    error: false,
    refreshError: false,
    errorVariant: "generic",
    cached: true,
    cachedAt: new Date().toISOString(),
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
    refresh: refreshSpy,
    ...overrides,
  };
}

beforeEach(() => {
  refreshSpy.mockClear();
});

describe("AiPageInsights stale de-emphasis (Cluster D / AI-07)", () => {
  it("de-emphasizes the stale summary and shows a refresh note", () => {
    cacheState.current = baseCache({ stale: true, dataChanged: true, staleReason: "revenue_edited" });
    render(<AiPageInsights page="dashboard" />);

    // The summary text is rendered inside a de-emphasized wrapper.
    const summary = screen.getByTestId("summary");
    const wrapper = summary.parentElement!;
    expect(wrapper.className).toContain("opacity-60");
    expect(wrapper.className).toContain("text-surface-400");

    // The explanatory note is present.
    expect(screen.getByText(/Based on earlier data — refresh for current figures/i)).toBeInTheDocument();
  });

  it("does NOT de-emphasize a fresh insight", () => {
    cacheState.current = baseCache({ stale: false, dataChanged: false });
    render(<AiPageInsights page="dashboard" />);

    const summary = screen.getByTestId("summary");
    const wrapper = summary.parentElement!;
    expect(wrapper.className ?? "").not.toContain("opacity-60");
    expect(screen.queryByText(/refresh for current figures/i)).not.toBeInTheDocument();
  });

  it("does NOT auto-refresh on mount even when stale (founder decision #12)", () => {
    cacheState.current = baseCache({ stale: true, dataChanged: true, staleReason: "revenue_edited" });
    render(<AiPageInsights page="dashboard" />);
    // The component must never spend credits without an explicit user click.
    expect(refreshSpy).not.toHaveBeenCalled();
  });
});
