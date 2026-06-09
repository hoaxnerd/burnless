import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CapTable } from "@burnless/engine";
import { LocaleProvider } from "@/components/locale/locale-context";
import { CapTableView } from "../cap-table-view";

function emptyCapTable(): CapTable & { isEmpty: boolean } {
  return {
    rows: [],
    totalFullyDiluted: 0,
    totals: {
      commonStock: 0,
      preferredStock: 0,
      safeOverhang: 0,
      optionPoolOverhang: 0,
    },
    dilutionDataNeedsPricedRound: false,
    isEmpty: true,
  };
}

function populatedCapTable(): CapTable & { isEmpty: boolean } {
  return {
    rows: [
      { holder: "Founders", shareClass: "Common", shares: 8_000_000, ownershipPercent: 0.8 },
      { holder: "Seed Investors", shareClass: "Preferred", shares: 2_000_000, ownershipPercent: 0.2 },
    ],
    totalFullyDiluted: 10_000_000,
    totals: {
      commonStock: 8_000_000,
      preferredStock: 2_000_000,
      safeOverhang: 0,
      optionPoolOverhang: 0,
    },
    dilutionDataNeedsPricedRound: false,
    isEmpty: false,
  };
}

describe("CapTableView", () => {
  it("renders the DataEmptyState with a /funding back link when empty, no percent chips", () => {
    render(
      <LocaleProvider>
        <CapTableView capTable={emptyCapTable()} />
      </LocaleProvider>,
    );

    // Empty-state copy present.
    expect(screen.getByText(/no share data yet/i)).toBeInTheDocument();

    // Back link to /funding present (also satisfies FUND-08 back-nav).
    const fundingLinks = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href") === "/funding");
    expect(fundingLinks.length).toBeGreaterThan(0);

    // The four 0.0% Stat chips must NOT render in the empty branch.
    expect(screen.queryByText("Common")).not.toBeInTheDocument();
    expect(screen.queryByText("SAFE Overhang")).not.toBeInTheDocument();
    expect(screen.queryByText("Option Pool")).not.toBeInTheDocument();
  });

  it("renders the table + four Stat chips when there is share data", () => {
    render(
      <LocaleProvider>
        <CapTableView capTable={populatedCapTable()} />
      </LocaleProvider>,
    );

    // No empty-state copy.
    expect(screen.queryByText(/no share data yet/i)).not.toBeInTheDocument();

    // Four Stat chips present ("Common"/"Preferred" also appear as share-class
    // cells in the table, so allow multiple matches).
    expect(screen.getAllByText("Common").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Preferred").length).toBeGreaterThan(0);
    expect(screen.getByText("SAFE Overhang")).toBeInTheDocument();
    expect(screen.getByText("Option Pool")).toBeInTheDocument();

    // Holder rows render.
    expect(screen.getByText("Founders")).toBeInTheDocument();
    expect(screen.getByText("Seed Investors")).toBeInTheDocument();

    // Back link still present on the non-empty header (FUND-08).
    const fundingLinks = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href") === "/funding");
    expect(fundingLinks.length).toBeGreaterThan(0);
  });
});
