/**
 * Cap-table empty-state guard for the /funding OwnershipChart.
 *
 * Bug: when a company has no share classes / option pools (the case for EVERY
 * company today — there is no UI to create them), the engine cap table is empty
 * and `foundersOwnership` derives to 0. The old OwnershipChart still rendered a
 * confident "Founders 0.0%" donut and dumped the 100% residual into a segment
 * mislabeled "Option Pool" (funding-details.tsx: `Option Pool = 100 - used`).
 * A founder then sees "Founder Ownership 0.0% / Option Pool 99.8%" — alarming
 * and wrong-looking, when the truth is "no cap-table data entered yet".
 *
 * Fix: when `hasCapTableData === false`, render a set-up empty state instead of
 * the fabricated breakdown. When true, render the real Founders + round + pool
 * segments unchanged.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/components/locale/locale-context";
import { OwnershipChart } from "../funding-details";

function wrap(ui: React.ReactNode) {
  return <LocaleProvider>{ui}</LocaleProvider>;
}

const seedRound = {
  id: "r1",
  name: "Seed Round",
  type: "seed",
  amount: 1_500_000,
  date: "2025-06-01T00:00:00.000Z",
  preMoneyValuation: 6_000_000,
  dilutionPercent: 0.2,
  isProjected: false,
  milestones: [],
} as never;

describe("OwnershipChart cap-table empty state", () => {
  it("renders a set-up empty state (no fake 'Option Pool', no '0.0%' founder donut) when the cap table has no data", () => {
    render(
      wrap(
        <OwnershipChart
          foundersOwnership={0}
          completedRounds={[seedRound]}
          hasCapTableData={false}
        />,
      ),
    );
    // The misleading residual segment must NOT appear.
    expect(screen.queryByText("Option Pool")).not.toBeInTheDocument();
    // A set-up affordance IS shown instead.
    expect(screen.getByText("No cap table yet")).toBeInTheDocument();
    expect(screen.getByText(/add share classes and equity grants/i)).toBeInTheDocument();
  });

  it("renders the real ownership breakdown when cap-table data exists", () => {
    render(
      wrap(
        <OwnershipChart
          foundersOwnership={80}
          completedRounds={[seedRound]}
          hasCapTableData
        />,
      ),
    );
    expect(screen.getAllByText("Founders").length).toBeGreaterThan(0);
    // Seed round segment renders (dilution > 0).
    expect(screen.getByText("Seed Round")).toBeInTheDocument();
  });

  it("renders the RECONCILED cap-table rows (matching /funding/cap-table) when capTableRows is provided", () => {
    // ownershipPercent is a 0-1 ratio; the chart shows ratioToPct → 0-100.
    render(
      wrap(
        <OwnershipChart
          foundersOwnership={69.6}
          completedRounds={[seedRound]}
          hasCapTableData
          capTableRows={[
            { holder: "Founders", ownershipPercent: 0.6957 },
            { holder: "Series Seed Preferred", ownershipPercent: 0.1739 },
            { holder: "Employee Option Pool", ownershipPercent: 0.1304 },
          ]}
        />,
      ),
    );
    // The reconciled holders drive the donut — NOT the legacy dilution residual.
    expect(screen.getAllByText("Series Seed Preferred").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Employee Option Pool").length).toBeGreaterThan(0);
    // The legacy "Seed Round" dilution segment must NOT appear when rows are given.
    expect(screen.queryByText("Seed Round")).not.toBeInTheDocument();
  });
});
