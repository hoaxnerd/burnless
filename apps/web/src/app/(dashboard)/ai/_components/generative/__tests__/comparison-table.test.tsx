import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GenerativeBlock } from "../generative-block";

describe("GenComparisonTable via GenerativeBlock", () => {
  it("renders the header labels and cell values", () => {
    render(
      <GenerativeBlock
        component="comparison_table"
        props={{
          title: "Hire now vs in 6 months",
          columns: [
            { key: "factor", label: "Factor" },
            { key: "now", label: "Hire now" },
          ],
          rows: [{ factor: "Runway impact", now: "Shorter" }],
        }}
      />
    );
    expect(screen.getByText("Factor")).toBeInTheDocument();
    expect(screen.getByText("Hire now")).toBeInTheDocument();
    expect(screen.getByText("Runway impact")).toBeInTheDocument();
    expect(screen.getByText("Shorter")).toBeInTheDocument();
  });
});
