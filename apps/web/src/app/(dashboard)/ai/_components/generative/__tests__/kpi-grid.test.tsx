import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/components/locale/locale-context";
import { GenerativeBlock } from "../generative-block";

describe("GenKpiGrid via GenerativeBlock", () => {
  it("renders a card for each requested metric", () => {
    render(
      <LocaleProvider>
        <GenerativeBlock
          component="kpi_grid"
          props={{
            items: [
              { label: "Runway", value: 14.2, format: "number", unit: "months" },
              { label: "MRR", value: 50000, format: "currency" },
            ],
          }}
        />
      </LocaleProvider>
    );
    expect(screen.getByText("Runway")).toBeInTheDocument();
    expect(screen.getByText(/14.2/)).toBeInTheDocument();
    expect(screen.getByText("months")).toBeInTheDocument();
    expect(screen.getByText("MRR")).toBeInTheDocument();
  });
});
