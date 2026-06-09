import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CapTable } from "@burnless/engine";

// The view now mounts <CapTableManager> (U5), which mounts the share-class /
// option-pool forms — these reach for next/navigation, apiFetch, and the toast
// context. Stub the navigation + network so the view renders without a router
// or a real fetch; wrap in ToastProvider for the manager's useToast.
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));
vi.mock("@/lib/api-fetch", () => ({
  apiFetch: vi.fn(async () => ({ ok: true, json: async () => ({}) })),
}));

import { LocaleProvider } from "@/components/locale/locale-context";
import { ToastProvider } from "@/components/ui/toast";
import { CapTableView, type ShareClassRow, type OptionPoolRow } from "../cap-table-view";

function wrap(ui: React.ReactNode) {
  return (
    <LocaleProvider>
      <ToastProvider>{ui}</ToastProvider>
    </LocaleProvider>
  );
}

function shareClassRows(): ShareClassRow[] {
  return [
    {
      id: "sc-common",
      name: "Common Stock",
      classType: "common",
      totalAuthorized: "10000000",
      totalIssued: "8000000",
    },
    {
      id: "sc-pref",
      name: "Series Seed Preferred",
      classType: "preferred",
      totalAuthorized: "3000000",
      totalIssued: "2000000",
    },
  ];
}

function optionPoolRows(): OptionPoolRow[] {
  return [
    {
      id: "op-1",
      name: "2026 Equity Incentive Plan",
      totalReserved: "1500000",
    },
  ];
}

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
  beforeEach(() => {
    refresh.mockClear();
  });

  it("renders the DataEmptyState with a /funding back link when empty, no percent chips", () => {
    render(wrap(<CapTableView capTable={emptyCapTable()} />));

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

  it("U5: the empty state exposes an add-share-class affordance that opens the form", () => {
    render(wrap(<CapTableView capTable={emptyCapTable()} />));

    // A brand-new company must be able to START the cap table from the empty
    // state — the action slot offers the share-class form trigger, not just a
    // "Go to Funding" link.
    const addTrigger = screen.getByTestId("open-add-share-class");
    expect(addTrigger).toBeInTheDocument();

    // The dialog is closed until the affordance is clicked.
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(addTrigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders the table + four Stat chips when there is share data", () => {
    render(wrap(<CapTableView capTable={populatedCapTable()} />));

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

  it("renders the raw share-class + option-pool structure rows from props (U1)", () => {
    render(
      wrap(
        <CapTableView
          capTable={populatedCapTable()}
          shareClasses={shareClassRows()}
          optionPools={optionPoolRows()}
        />,
      ),
    );

    // The raw structure rows wired through from the server must be visible.
    expect(screen.getByText("Common Stock")).toBeInTheDocument();
    expect(screen.getByText("Series Seed Preferred")).toBeInTheDocument();
    expect(screen.getByText("2026 Equity Incentive Plan")).toBeInTheDocument();
  });

  it("U5: mounts the CapTableManager below the holder table when not empty", () => {
    render(
      wrap(
        <CapTableView
          capTable={populatedCapTable()}
          shareClasses={shareClassRows()}
          optionPools={optionPoolRows()}
        />,
      ),
    );

    // The editable Manage section is now part of the view (moved out of page.tsx).
    expect(screen.getByTestId("cap-table-manager")).toBeInTheDocument();
    // The foots-to-100% holder rows are still rendered alongside it.
    expect(screen.getByText("Founders")).toBeInTheDocument();
  });
});
