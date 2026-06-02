import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { LocaleProvider } from "@/components/locale/locale-context";
import { GenerativeBlock } from "../generative-block";

describe("GenRunway via GenerativeBlock", () => {
  it("renders the runway months prominently and the cash-out month", () => {
    render(
      <LocaleProvider>
        <GenerativeBlock
          component="runway"
          props={{
            runwayMonths: 14.2,
            netBurn: 82000,
            cash: 818000,
            zeroCashMonth: "2027-09",
            format: "currency",
          }}
        />
      </LocaleProvider>
    );
    expect(screen.getByText(/14.2/)).toBeInTheDocument();
    expect(screen.getByText(/months/i)).toBeInTheDocument();
    expect(screen.getByText(/2027-09/)).toBeInTheDocument();
  });

  it("renders dashes (no months, no cash-out) when there is no data", () => {
    const { container } = render(
      <LocaleProvider>
        <GenerativeBlock
          component="runway"
          props={{
            runwayMonths: null,
            netBurn: null,
            cash: null,
            zeroCashMonth: null,
            format: "currency",
          }}
        />
      </LocaleProvider>
    );
    // No "months" suffix and no cash-out line when runway is unknown.
    expect(screen.queryByText(/months/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/cash-out/i)).not.toBeInTheDocument();
    // The headline runway value renders an em dash.
    expect(within(container).getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });
});
