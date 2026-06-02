import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/components/locale/locale-context";
import { GenerativeBlock } from "../generative-block";

describe("GenMetricCard via GenerativeBlock", () => {
  it("renders a runway metric card", () => {
    render(
      <LocaleProvider>
        <GenerativeBlock
          component="metric_card"
          props={{ label: "Runway", value: 14.2, format: "number", unit: "months" }}
        />
      </LocaleProvider>
    );
    expect(screen.getByText("Runway")).toBeInTheDocument();
    expect(screen.getByText(/14.2/)).toBeInTheDocument();
    expect(screen.getByText("months")).toBeInTheDocument();
  });

  it("renders an em dash for a null value", () => {
    render(
      <LocaleProvider>
        <GenerativeBlock
          component="metric_card"
          props={{ label: "MRR", value: null, format: "currency" }}
        />
      </LocaleProvider>
    );
    expect(screen.getByText("MRR")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
