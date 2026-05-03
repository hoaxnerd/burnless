import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CurrencyInput } from "../CurrencyInput";

vi.mock("@/components/locale/locale-context", () => ({
  useLocale: () => ({
    currency: "USD",
    currencySymbol: "$",
    locale: "en-US",
    fmtCurrency: (n: number) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n),
    fmtCompact: (n: number) => `$${n}`,
    currencySettings: { currency: "USD", locale: "en-US" },
  }),
}));

describe("CurrencyInput", () => {
  it("renders the currency-symbol prefix from the locale", () => {
    render(<CurrencyInput value={0} onChange={() => {}} label="Amount" />);
    expect(screen.getByText("$")).toBeTruthy();
  });

  it("calls onChange with a raw number when the input changes", () => {
    const onChange = vi.fn();
    render(<CurrencyInput value={0} onChange={onChange} label="Amount" />);
    fireEvent.change(screen.getByRole("spinbutton", { name: /amount/i }), {
      target: { value: "1500" },
    });
    expect(onChange).toHaveBeenCalledWith(1500);
  });

  it("renders a formatted preview hint for the current value", () => {
    render(<CurrencyInput value={1500} onChange={() => {}} label="Amount" />);
    const preview = screen.getByTestId("currency-input-preview");
    expect(preview.textContent).toContain("1,500.00");
  });
});
