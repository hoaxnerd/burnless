import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/components/locale/locale-context";
import { GenerativeBlock } from "../generative-block";

describe("GenScenarioDiff via GenerativeBlock", () => {
  it("renders both scenario names and a per-metric row with a delta", () => {
    render(
      <LocaleProvider>
        <GenerativeBlock
          component="scenario_diff"
          props={{
            aName: "Base plan",
            bName: "Aggressive hiring",
            rows: [
              { label: "Revenue", a: 50000, b: 60000, delta: 10000, format: "currency" },
              { label: "Headcount", a: 11, b: 14, delta: 3, format: "number" },
            ],
          }}
        />
      </LocaleProvider>
    );
    expect(screen.getByText("Base plan")).toBeInTheDocument();
    expect(screen.getByText("Aggressive hiring")).toBeInTheDocument();
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("Headcount")).toBeInTheDocument();
    // Positive headcount delta renders with a sign prefix.
    expect(screen.getByText(/\+3/)).toBeInTheDocument();
  });

  it("renders an empty-state message when there are no rows", () => {
    render(
      <LocaleProvider>
        <GenerativeBlock
          component="scenario_diff"
          props={{ aName: "A", bName: "B", rows: [] }}
        />
      </LocaleProvider>
    );
    expect(screen.getByText(/no scenario comparison data/i)).toBeInTheDocument();
  });
});
