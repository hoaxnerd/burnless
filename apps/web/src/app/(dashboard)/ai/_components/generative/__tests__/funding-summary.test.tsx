import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/components/locale/locale-context";
import { GenerativeBlock } from "../generative-block";

describe("GenFundingSummary via GenerativeBlock", () => {
  it("lists round names with amounts and the total raised", () => {
    render(
      <LocaleProvider>
        <GenerativeBlock
          component="funding_summary"
          props={{
            totalRaised: 9_500_000,
            rounds: [
              {
                name: "Seed",
                type: "seed",
                amount: 1_500_000,
                date: "2024-03-01",
                isProjected: false,
              },
              {
                name: "Series A",
                type: "series_a",
                amount: 8_000_000,
                date: "2025-09-01",
                isProjected: false,
              },
            ],
          }}
        />
      </LocaleProvider>
    );
    // "Seed" / "Series A" appear twice each — once as the round name, once as the
    // humanized round-type label ("seed" → "Seed", "series_a" → "Series A").
    expect(screen.getAllByText("Seed").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Series A").length).toBeGreaterThanOrEqual(1);
    // Total raised line present.
    expect(screen.getByText(/raised/i)).toBeInTheDocument();
  });

  it("flags a projected round distinctly", () => {
    render(
      <LocaleProvider>
        <GenerativeBlock
          component="funding_summary"
          props={{
            totalRaised: 1_500_000,
            rounds: [
              {
                name: "Series B (planned)",
                type: "series_b",
                amount: 20_000_000,
                date: "2027-01-01",
                isProjected: true,
              },
            ],
          }}
        />
      </LocaleProvider>
    );
    expect(screen.getByText("Series B (planned)")).toBeInTheDocument();
    expect(screen.getByText(/projected/i)).toBeInTheDocument();
  });

  it("renders an empty-state message when there are no rounds", () => {
    render(
      <LocaleProvider>
        <GenerativeBlock component="funding_summary" props={{ totalRaised: 0, rounds: [] }} />
      </LocaleProvider>
    );
    expect(screen.getByText(/no funding rounds/i)).toBeInTheDocument();
  });
});
