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
  Select: ({ label, error, children, ...props }: { label?: string; error?: string; children?: React.ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <label>
      {label && <span>{label}</span>}
      <select aria-label={label} {...props}>{children}</select>
      {error && <span role="alert">{error}</span>}
    </label>
  ),
  IconButton: ({ icon, ...props }: { icon: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{icon}</button>
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

import { EquityGrantsList } from "../equity-grants-list";

describe("<EquityGrantsList>", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshMock.mockClear();
  });

  it("renders rows ascending by grantDate", () => {
    render(
      <EquityGrantsList
        headcountId="h1"
        grants={[
          { id: "b", grantDate: "2026-12-01", shares: 1000, grantType: "iso" },
          { id: "a", grantDate: "2026-03-01", shares: 500, grantType: "rsu" },
        ]}
      />,
    );
    const rows = screen.getAllByTestId(/^equity-grant-/);
    expect(rows[0]!.getAttribute("data-testid")).toBe("equity-grant-a");
    expect(rows[1]!.getAttribute("data-testid")).toBe("equity-grant-b");
  });

  it("renders empty state when no grants", () => {
    render(<EquityGrantsList headcountId="h1" grants={[]} />);
    expect(screen.getByText("No equity grants recorded.")).toBeTruthy();
  });

  it("opens modal, POSTs body with parameters.vestingSchedule, and refreshes on success", async () => {
    const { apiFetch } = await import("@/lib/api-fetch");
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    render(<EquityGrantsList headcountId="h1" grants={[]} />);

    fireEvent.click(screen.getByTestId("open-add-equity-grant"));
    fireEvent.change(screen.getByLabelText("Grant date"), {
      target: { value: "2026-06-01" },
    });
    fireEvent.change(screen.getByLabelText("Shares"), {
      target: { value: "1000" },
    });
    fireEvent.change(screen.getByLabelText("Strike price (optional)"), {
      target: { value: "1.5" },
    });
    fireEvent.change(screen.getByTestId("equity-grant-type"), {
      target: { value: "nso" },
    });

    // Add one vesting milestone via embedded editor
    fireEvent.change(screen.getByLabelText("Vesting date"), {
      target: { value: "2027-06-01" },
    });
    fireEvent.change(screen.getByLabelText("Shares vested"), {
      target: { value: "250" },
    });
    fireEvent.click(screen.getByTestId("add-vesting"));

    fireEvent.click(screen.getByTestId("submit-equity-grant"));
    await new Promise((r) => setTimeout(r, 0));

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = (apiFetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("/api/headcount/h1/equity-grants");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.grantDate).toBe("2026-06-01");
    expect(body.shares).toBe(1000);
    expect(body.strikePrice).toBe(1.5);
    expect(body.grantType).toBe("nso");
    expect(body.parameters).toEqual({
      vestingSchedule: [
        { type: "cliff", date: "2027-06-01", sharesVested: 250 },
      ],
    });
    expect(refreshMock).toHaveBeenCalled();
  });

  it("strikePrice empty → null in payload", async () => {
    const { apiFetch } = await import("@/lib/api-fetch");
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    render(<EquityGrantsList headcountId="h1" grants={[]} />);

    fireEvent.click(screen.getByTestId("open-add-equity-grant"));
    fireEvent.change(screen.getByLabelText("Grant date"), {
      target: { value: "2026-06-01" },
    });
    fireEvent.change(screen.getByLabelText("Shares"), {
      target: { value: "500" },
    });
    fireEvent.click(screen.getByTestId("submit-equity-grant"));
    await new Promise((r) => setTimeout(r, 0));

    const [, init] = (apiFetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = JSON.parse(init.body as string);
    expect(body.strikePrice).toBeNull();
  });

  it("delete: confirm → DELETE → refresh", async () => {
    const { apiFetch } = await import("@/lib/api-fetch");
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    render(
      <EquityGrantsList
        headcountId="h1"
        grants={[{ id: "a", grantDate: "2026-01-01", shares: 1000, grantType: "iso" }]}
      />,
    );

    fireEvent.click(screen.getByTestId("delete-equity-grant-a"));
    await new Promise((r) => setTimeout(r, 0));

    const [url, init] = (apiFetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("/api/headcount/h1/equity-grants/a");
    expect(init.method).toBe("DELETE");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("displays error message when POST fails", async () => {
    const { apiFetch } = await import("@/lib/api-fetch");
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "fail" }),
    });

    render(<EquityGrantsList headcountId="h1" grants={[]} />);

    fireEvent.click(screen.getByTestId("open-add-equity-grant"));
    fireEvent.change(screen.getByLabelText("Grant date"), {
      target: { value: "2026-06-01" },
    });
    fireEvent.change(screen.getByLabelText("Shares"), {
      target: { value: "1000" },
    });
    fireEvent.click(screen.getByTestId("submit-equity-grant"));
    await new Promise((r) => setTimeout(r, 0));

    const alerts = screen.getAllByRole("alert");
    expect(alerts.some((a) => a.textContent?.includes("fail"))).toBe(true);
  });
});
