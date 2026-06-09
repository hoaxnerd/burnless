/**
 * FUND-07: clicking a funding-round row opens a detail panel that mounts
 * <InvestorList> (always) and <MilestoneTracker> (for grant rounds with
 * milestones). These components were previously unmounted orphans.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/components/scenarios/use-scenario-overrides", () => ({
  useScenarioOverrides: () => ({
    isInScenarioMode: false,
    overrideMap: new Map(),
    deletedEntities: [],
    isLoading: false,
    handleRevert: vi.fn(),
    handleRemove: vi.fn(),
    handleRestore: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

// apiFetch backs InvestorList's SWR fetch. Return an empty investor list so the
// component mounts (and shows its "+ Add investor" affordance) without a network.
vi.mock("@/lib/api-fetch", () => ({
  apiFetch: vi.fn(async () => ({
    ok: true,
    json: async () => ({ investors: [] }),
  })),
}));

import { LocaleProvider } from "@/components/locale/locale-context";
import { ToastProvider } from "@/components/ui/toast";
import { FundingRoundsList } from "../funding-details";

function wrap(ui: React.ReactNode) {
  return (
    <LocaleProvider>
      <ToastProvider>{ui}</ToastProvider>
    </LocaleProvider>
  );
}

const baseProps = {
  foundersOwnership: 80,
  calcRaiseAmount: 0,
  setCalcRaiseAmount: vi.fn(),
  calcPreMoney: 0,
  setCalcPreMoney: vi.fn(),
  calcDilution: { dilution: 0, postMoney: 0, newOwnership: 0 },
  currency: "USD" as const,
};

describe("FundingRoundsList round-detail panel (FUND-07)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mounts InvestorList when a round row is clicked", async () => {
    render(
      wrap(
        <FundingRoundsList
          {...baseProps}
          rounds={[
            {
              id: "round-1",
              name: "Seed",
              type: "seed",
              amount: 1_500_000,
              date: "2024-03-01",
              preMoneyValuation: 8_000_000,
              dilutionPercent: 15,
              isProjected: false,
            },
          ]}
        />,
      ),
    );

    // Open the detail panel.
    fireEvent.click(screen.getByLabelText("View details for Seed"));

    // InvestorList header + add affordance appear.
    await waitFor(() => {
      expect(screen.getByText("Investors")).toBeInTheDocument();
    });
    expect(screen.getByText(/add investor/i)).toBeInTheDocument();
  });

  it("mounts MilestoneTracker for a grant round with milestones", async () => {
    render(
      wrap(
        <FundingRoundsList
          {...baseProps}
          rounds={[
            {
              id: "grant-1",
              name: "SBIR Grant",
              type: "grant",
              amount: 500_000,
              date: "2024-06-01",
              preMoneyValuation: null,
              dilutionPercent: null,
              isProjected: false,
              milestones: [
                { id: "m1", label: "Prototype", amount: 250_000, dueDate: "2024-12-01" },
              ],
            },
          ]}
        />,
      ),
    );

    fireEvent.click(screen.getByLabelText("View details for SBIR Grant"));

    await waitFor(() => {
      expect(screen.getByText("Milestones")).toBeInTheDocument();
    });
    // The milestone label renders inside MilestoneTracker.
    expect(screen.getByText("Prototype")).toBeInTheDocument();
    // Investors still mounted alongside.
    expect(screen.getByText("Investors")).toBeInTheDocument();
  });

  it("does not render the milestone section for a non-grant round", async () => {
    render(
      wrap(
        <FundingRoundsList
          {...baseProps}
          rounds={[
            {
              id: "round-2",
              name: "Series A",
              type: "series_a",
              amount: 8_000_000,
              date: "2025-01-01",
              preMoneyValuation: 30_000_000,
              dilutionPercent: 20,
              isProjected: false,
            },
          ]}
        />,
      ),
    );

    fireEvent.click(screen.getByLabelText("View details for Series A"));

    await waitFor(() => {
      expect(screen.getByText("Investors")).toBeInTheDocument();
    });
    expect(screen.queryByText("Milestones")).not.toBeInTheDocument();
  });
});
