import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/components/locale/locale-context";
import { GenerativeBlock } from "../generative-block";

describe("GenDataTable via GenerativeBlock", () => {
  it("renders the column headers and a row driven by the columns spec", () => {
    render(
      <LocaleProvider>
        <GenerativeBlock
          component="data_table"
          props={{
            title: "P&L summary",
            columns: [
              { key: "line", label: "Line item" },
              { key: "amount", label: "Amount", format: "currency" },
            ],
            rows: [
              { line: "Revenue", amount: 50000 },
              { line: "Net income", amount: -82000 },
            ],
          }}
        />
      </LocaleProvider>
    );
    expect(screen.getByText("Line item")).toBeInTheDocument();
    expect(screen.getByText("Amount")).toBeInTheDocument();
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("Net income")).toBeInTheDocument();
    // The amount column is formatted (currency), so the raw number is not shown verbatim.
    expect(screen.queryByText("50000")).not.toBeInTheDocument();
  });

  it("renders an empty-state message when there are no rows", () => {
    render(
      <LocaleProvider>
        <GenerativeBlock component="data_table" props={{ columns: [], rows: [] }} />
      </LocaleProvider>
    );
    expect(screen.getByText(/no data available/i)).toBeInTheDocument();
  });
});
