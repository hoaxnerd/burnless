import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FinancialsSummarySection } from "../summary-sections";
import type { CompanyFields } from "../../types";
import { SANE_MAX_AMOUNT } from "@/lib/onboarding-helpers";

function baseFields(overrides: Partial<CompanyFields> = {}): CompanyFields {
  const f = (value: string): CompanyFields["monthly_revenue"] => ({
    value,
    confidence: "low",
    source: "default",
  });
  return {
    company_name: f(""),
    stage: f("Pre-seed"),
    business_model: f("SaaS"),
    industry: f(""),
    monthly_revenue: f("0"),
    team_size: f("1"),
    funding: f("0"),
    main_expenses: f("General operations"),
    ...overrides,
  };
}

describe("ONB-02 FinancialsSummarySection warning chip", () => {
  it("does NOT render a warning for a reasonable monthly_revenue", () => {
    render(
      <FinancialsSummarySection
        fields={baseFields({
          monthly_revenue: { value: "50000", confidence: "high", source: "ai" },
        })}
        onUpdateField={vi.fn()}
        currencySymbol="$"
      />,
    );
    expect(
      screen.queryByText(/looks unusually large/i),
    ).not.toBeInTheDocument();
  });

  it("renders a non-blocking warning chip for an absurd monthly_revenue", () => {
    render(
      <FinancialsSummarySection
        fields={baseFields({
          // 9.8 billion — well above the 1e9 display threshold but below the
          // server hard max, so the client only warns.
          monthly_revenue: { value: "9800000098", confidence: "high", source: "ai" },
        })}
        onUpdateField={vi.fn()}
        currencySymbol="$"
      />,
    );
    expect(screen.getByText(/looks unusually large/i)).toBeInTheDocument();
  });

  it("renders a warning chip for an absurd funding value", () => {
    render(
      <FinancialsSummarySection
        fields={baseFields({
          funding: { value: "5000000000", confidence: "high", source: "ai" },
        })}
        onUpdateField={vi.fn()}
        currencySymbol="$"
      />,
    );
    expect(screen.getByText(/looks unusually large/i)).toBeInTheDocument();
  });

  it("caps the input with the server hard-max as the max attribute", () => {
    render(
      <FinancialsSummarySection
        fields={baseFields()}
        onUpdateField={vi.fn()}
        currencySymbol="$"
      />,
    );
    const revenueInput = screen.getByLabelText("Monthly Revenue");
    expect(revenueInput).toHaveAttribute("max", String(SANE_MAX_AMOUNT));
  });
});
