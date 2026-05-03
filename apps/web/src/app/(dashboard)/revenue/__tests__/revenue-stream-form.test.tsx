import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RevenueStreamForm } from "../revenue-stream-form";

vi.mock("@/components/locale/locale-context", () => ({
  useLocale: () => ({
    currency: "USD",
    currencySymbol: "$",
    locale: "en-US",
    fmtCurrency: (n: number) => `$${n.toFixed(2)}`,
    fmtCompact: (n: number) => `$${n}`,
    currencySettings: { currency: "USD", locale: "en-US" },
  }),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("RevenueStreamForm", () => {
  it("renders subscription fields by default and switches to marketplace fields when type changes", () => {
    render(<RevenueStreamForm mode="add" onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/starting customers/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/revenue stream type/i), {
      target: { value: "marketplace" },
    });
    expect(screen.getByLabelText(/starting gmv/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/starting customers/i)).not.toBeInTheDocument();
  });

  it("submits with normalized values", async () => {
    const onSubmit = vi.fn();
    render(
      <RevenueStreamForm
        mode="add"
        onSubmit={onSubmit}
        initial={{ name: "Test", startDate: "2026-04-01" }}
      />,
    );
    fireEvent.submit(screen.getByRole("form", { name: /add revenue stream/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const args = onSubmit.mock.calls[0]![0];
    expect(args.name).toBe("Test");
    expect(args.type).toBe("subscription");
    expect(args.startDate).toBe("2026-04-01");
    expect(args.endDate).toBeNull();
    expect(args.parameters).toMatchObject({ startingCustomers: 0, monthlyPrice: 0 });
  });
});
