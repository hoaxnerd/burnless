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
        scenarioId="s1"
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
    render(<BonusesList headcountId="h1" scenarioId="s1" bonuses={[]} />);
    expect(screen.getByText("No bonuses recorded.")).toBeTruthy();
  });

  it("opens modal, POSTs body, and refreshes on success", async () => {
    const { apiFetch } = await import("@/lib/api-fetch");
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    render(<BonusesList headcountId="h1" scenarioId="s1" bonuses={[]} />);

    fireEvent.click(screen.getByTestId("open-add-bonus"));
    fireEvent.change(screen.getByTestId("bonus-payout-month"), {
      target: { value: "2026-06-01" },
    });
    fireEvent.change(screen.getByTestId("bonus-amount"), {
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
    window.confirm = vi.fn(() => true);

    render(
      <BonusesList
        headcountId="h1"
        scenarioId="s1"
        bonuses={[{ id: "a", payoutMonth: "2026-01-01", amount: 1000, type: "signing" }]}
      />,
    );

    fireEvent.click(screen.getByTestId("delete-bonus-a"));
    await new Promise((r) => setTimeout(r, 0));

    expect(window.confirm).toHaveBeenCalled();
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

    render(<BonusesList headcountId="h1" scenarioId="s1" bonuses={[]} />);

    fireEvent.click(screen.getByTestId("open-add-bonus"));
    fireEvent.change(screen.getByTestId("bonus-payout-month"), {
      target: { value: "2026-06-01" },
    });
    fireEvent.change(screen.getByTestId("bonus-amount"), {
      target: { value: "5000" },
    });
    fireEvent.click(screen.getByTestId("submit-bonus"));
    await new Promise((r) => setTimeout(r, 0));

    const alerts = screen.getAllByRole("alert");
    expect(alerts.some((a) => a.textContent?.includes("nope"))).toBe(true);
  });
});
