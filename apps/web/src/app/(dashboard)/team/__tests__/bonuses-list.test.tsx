import { vi, describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));
vi.mock("@/lib/api-fetch", () => ({ apiFetch: vi.fn() }));
vi.mock("@/components/ui", () => ({
  Modal: ({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
  Input: ({ label, error, showOptional, hint, ...props }: { label?: string; error?: string; showOptional?: boolean; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <label>
      {label && <span>{label}</span>}
      <input aria-label={label} {...props} />
      {error && <span role="alert">{error}</span>}
    </label>
  ),
  Select: ({ label, error, children, ...props }: { label?: string; error?: string; children?: React.ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <label>
      {label && <span>{label}</span>}
      <select aria-label={label} {...props}>{children}</select>
      {error && <span role="alert">{error}</span>}
    </label>
  ),
  useConfirm: () => ({ confirm: () => Promise.resolve(true), dialog: null }),
}));
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

import { BonusesList } from "../bonuses-list";

describe("<BonusesList>", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshMock.mockClear();
  });

  it("renders rows ascending by payoutMonth", () => {
    render(
      <BonusesList
        headcountId="h1"
        bonuses={[
          { id: "b", payoutMonth: "2026-12-01", amount: 5000, type: "performance" },
          { id: "a", payoutMonth: "2026-03-01", amount: 2000, type: "signing" },
        ]}
      />,
    );
    const rows = screen.getAllByTestId(/^bonus-/);
    expect(rows[0]!.getAttribute("data-testid")).toBe("bonus-a");
    expect(rows[1]!.getAttribute("data-testid")).toBe("bonus-b");
  });

  it("renders empty state when no bonuses", () => {
    render(<BonusesList headcountId="h1" bonuses={[]} />);
    expect(screen.getByText("No bonuses recorded.")).toBeTruthy();
  });

  it("labels the column header 'Payout date' (TEAM-06) to match the date control", () => {
    render(
      <BonusesList
        headcountId="h1"
        bonuses={[{ id: "a", payoutMonth: "2026-01-01", amount: 1000, type: "signing" }]}
      />,
    );
    expect(screen.getByText("Payout date")).toBeTruthy();
    expect(screen.queryByText("Payout month")).toBeNull();
  });

  it("labels the date field 'Payout date' (TEAM-06)", () => {
    render(<BonusesList headcountId="h1" bonuses={[]} />);
    fireEvent.click(screen.getByTestId("open-add-bonus"));
    expect(screen.getByLabelText("Payout date")).toBeTruthy();
  });

  it("opens modal, POSTs body, and refreshes on success", async () => {
    const { apiFetch } = await import("@/lib/api-fetch");
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    render(<BonusesList headcountId="h1" bonuses={[]} />);

    fireEvent.click(screen.getByTestId("open-add-bonus"));
    fireEvent.change(screen.getByLabelText("Payout date"), {
      target: { value: "2026-06-01" },
    });
    fireEvent.change(screen.getByLabelText("Amount"), {
      target: { value: "5000" },
    });
    fireEvent.change(screen.getByTestId("bonus-type"), {
      target: { value: "retention" },
    });
    fireEvent.change(screen.getByTestId("bonus-notes"), {
      target: { value: "good work" },
    });
    fireEvent.click(screen.getByTestId("submit-bonus"));
    await new Promise((r) => setTimeout(r, 0));

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = (apiFetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("/api/headcount/h1/bonuses");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      payoutMonth: "2026-06-01",
      amount: 5000,
      type: "retention",
      notes: "good work",
    });
    expect(refreshMock).toHaveBeenCalled();
  });

  it("delete: confirm → DELETE → refresh", async () => {
    const { apiFetch } = await import("@/lib/api-fetch");
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    render(
      <BonusesList
        headcountId="h1"
        bonuses={[{ id: "a", payoutMonth: "2026-01-01", amount: 1000, type: "signing" }]}
      />,
    );

    fireEvent.click(screen.getByTestId("delete-bonus-a"));
    await new Promise((r) => setTimeout(r, 0));

    const [url, init] = (apiFetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("/api/headcount/h1/bonuses/a");
    expect(init.method).toBe("DELETE");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("displays error message when POST fails", async () => {
    const { apiFetch } = await import("@/lib/api-fetch");
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "nope" }),
    });

    render(<BonusesList headcountId="h1" bonuses={[]} />);

    fireEvent.click(screen.getByTestId("open-add-bonus"));
    fireEvent.change(screen.getByLabelText("Payout date"), {
      target: { value: "2026-06-01" },
    });
    fireEvent.change(screen.getByLabelText("Amount"), {
      target: { value: "5000" },
    });
    fireEvent.click(screen.getByTestId("submit-bonus"));
    await new Promise((r) => setTimeout(r, 0));

    const alerts = screen.getAllByRole("alert");
    expect(alerts.some((a) => a.textContent?.includes("nope"))).toBe(true);
  });
});
