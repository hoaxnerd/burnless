import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Credits are a billing concept — the AI Dashboard tab must hide them when
// billing is OFF (self-host / bring-your-own-AI), mirroring ai-features-tab.

const { mockUseCapabilities } = vi.hoisted(() => ({ mockUseCapabilities: vi.fn() }));

const creditsData = {
  period: { days: 30, since: "2026-05-01" },
  summary: { totalCostMicros: 0, totalCostUSD: 0, totalRequests: 0 },
  credits: { used: 0, total: 500, remaining: 500, percentUsed: 0, warning: false, exceeded: false },
  featureBreakdown: [],
  dailySpend: [],
  providerHealth: [],
  routing: { featureTiers: {}, featureProviders: {} },
};

vi.mock("@/lib/swr", () => ({
  useAiDashboard: () => ({ data: creditsData, isLoading: false }),
}));
vi.mock("@/components/locale/locale-context", () => ({
  useLocale: () => ({
    fmtCurrency: (n: number) => `$${n}`,
    fmtPercent: (n: number) => `${n}%`,
  }),
}));
vi.mock("@/components/providers/capability-context", () => ({
  useCapabilities: mockUseCapabilities,
}));

import { AiDashboardTab } from "../ai-dashboard-tab";

describe("AiDashboardTab — credits gated on billing", () => {
  beforeEach(() => mockUseCapabilities.mockReset());

  it("hides the credits cap when billing is OFF (self-host)", () => {
    mockUseCapabilities.mockReturnValue({ billing: false } as never);
    render(<AiDashboardTab />);
    expect(screen.queryByText("Monthly Credits")).not.toBeInTheDocument();
    expect(screen.queryByText("Credits Used")).not.toBeInTheDocument();
    expect(screen.queryByText(/\/ 500 credits/)).not.toBeInTheDocument();
  });

  it("shows the credits cap when billing is ON (cloud)", () => {
    mockUseCapabilities.mockReturnValue({ billing: true } as never);
    render(<AiDashboardTab />);
    expect(screen.getByText("Monthly Credits")).toBeInTheDocument();
    expect(screen.getByText("Credits Used")).toBeInTheDocument();
  });
});
