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

import { SalaryChangesList } from "../salary-changes-list";

describe("<SalaryChangesList>", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshMock.mockClear();
  });

  it("renders rows ascending by effectiveDate", () => {
    render(
      <SalaryChangesList
        headcountId="h1"
        scenarioId="s1"
        changes={[
          { id: "b", effectiveDate: "2026-06-01", newSalary: 110_000 },
          { id: "a", effectiveDate: "2026-01-01", newSalary: 100_000 },
        ]}
      />,
    );
    const rows = screen.getAllByTestId(/^salary-change-/);
    expect(rows[0]!.getAttribute("data-testid")).toBe("salary-change-a");
    expect(rows[1]!.getAttribute("data-testid")).toBe("salary-change-b");
  });

  it("renders empty state when no changes", () => {
    render(<SalaryChangesList headcountId="h1" scenarioId="s1" changes={[]} />);
    expect(screen.getByText("No salary changes recorded.")).toBeTruthy();
  });

  it("opens modal, POSTs body, and refreshes on success", async () => {
    const { apiFetch } = await import("@/lib/api-fetch");
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    render(<SalaryChangesList headcountId="h1" scenarioId="s1" changes={[]} />);

    fireEvent.click(screen.getByTestId("open-add-salary-change"));
    fireEvent.change(screen.getByTestId("salary-change-effective-date"), {
      target: { value: "2026-06-01" },
    });
    fireEvent.change(screen.getByTestId("salary-change-new-salary"), {
      target: { value: "120000" },
    });
    fireEvent.change(screen.getByTestId("salary-change-reason"), {
      target: { value: "promo" },
    });
    fireEvent.click(screen.getByTestId("submit-salary-change"));
    await new Promise((r) => setTimeout(r, 0));

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = (apiFetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("/api/headcount/h1/salary-changes");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      effectiveDate: "2026-06-01",
      newSalary: 120000,
      reason: "promo",
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
      <SalaryChangesList
        headcountId="h1"
        scenarioId="s1"
        changes={[{ id: "a", effectiveDate: "2026-01-01", newSalary: 100_000 }]}
      />,
    );

    fireEvent.click(screen.getByTestId("delete-salary-change-a"));
    await new Promise((r) => setTimeout(r, 0));

    expect(window.confirm).toHaveBeenCalled();
    const [url, init] = (apiFetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("/api/headcount/h1/salary-changes/a");
    expect(init.method).toBe("DELETE");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("displays error message when POST fails", async () => {
    const { apiFetch } = await import("@/lib/api-fetch");
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "boom" }),
    });

    render(<SalaryChangesList headcountId="h1" scenarioId="s1" changes={[]} />);

    fireEvent.click(screen.getByTestId("open-add-salary-change"));
    fireEvent.change(screen.getByTestId("salary-change-effective-date"), {
      target: { value: "2026-06-01" },
    });
    fireEvent.change(screen.getByTestId("salary-change-new-salary"), {
      target: { value: "120000" },
    });
    fireEvent.click(screen.getByTestId("submit-salary-change"));
    await new Promise((r) => setTimeout(r, 0));

    const alerts = screen.getAllByRole("alert");
    expect(alerts.some((a) => a.textContent?.includes("boom"))).toBe(true);
  });
});
