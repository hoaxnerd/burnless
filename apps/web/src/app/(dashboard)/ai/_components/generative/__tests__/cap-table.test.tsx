import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/components/locale/locale-context";
import { GenerativeBlock } from "../generative-block";

describe("GenCapTable via GenerativeBlock", () => {
  it("renders a holder row with shares and ownership percent", () => {
    render(
      <LocaleProvider>
        <GenerativeBlock
          component="cap_table"
          props={{
            totalShares: 10_000_000,
            rows: [
              { holder: "Founders", shares: 8_000_000, pctOwnership: 80, shareClass: "Common" },
              { holder: "Series A", shares: 1_500_000, pctOwnership: 15, shareClass: "Preferred" },
            ],
          }}
        />
      </LocaleProvider>
    );
    expect(screen.getByText("Founders")).toBeInTheDocument();
    expect(screen.getByText("Series A")).toBeInTheDocument();
    // Ownership percent rendered through the percent formatter.
    expect(screen.getByText(/80\.0%/)).toBeInTheDocument();
  });

  it("renders an empty-state message when there are no rows", () => {
    render(
      <LocaleProvider>
        <GenerativeBlock component="cap_table" props={{ totalShares: 0, rows: [] }} />
      </LocaleProvider>
    );
    expect(screen.getByText(/no cap table data/i)).toBeInTheDocument();
  });
});
