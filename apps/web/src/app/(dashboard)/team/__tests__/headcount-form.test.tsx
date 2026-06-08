import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { HeadcountForm } from "../headcount-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/api-fetch", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("@/components/ui", () => ({
  Modal: ({ open, children, title }: { open: boolean; children: React.ReactNode; title: string }) =>
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
}));

vi.mock("@/components/locale/locale-context", () => ({
  useLocale: () => ({
    currency: "USD",
    currencySymbol: "$",
    locale: "en-US",
    fmtCurrency: (n: number) => `$${n.toFixed(2)}`,
    fmtCompact: (n: number) => `$${n}`,
    fmtPercent: (n: number, decimals = 1) => `${n.toFixed(decimals)}%`,
    currencySettings: { currency: "USD", locale: "en-US" },
  }),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const departments = [{ id: "d1", name: "Engineering" }];

describe("<HeadcountForm>", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Add hire title in add mode", () => {
    render(<HeadcountForm departments={departments} open={true} />);
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe("Add hire");
  });

  it("renders Edit hire title in edit mode", () => {
    render(
      <HeadcountForm
        departments={departments}
        open={true}
        edit={{
          id: "h1",
          departmentId: "d1",
          title: "Engineer",
          employeeType: "full_time",
          count: 1,
          salary: 100_000,
          hourlyRate: null,
          hoursPerWeek: null,
          startDate: "2026-06-01",
          benefitsRate: 0.2,
        }}
      />,
    );
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe("Edit hire");
  });

  it("changing employeeType to contractor reveals contractor fields and hides full-time fields", () => {
    render(<HeadcountForm departments={departments} open={true} />);
    expect(screen.getByTestId("full-time-fields")).toBeTruthy();
    expect(screen.queryByTestId("contractor-fields")).toBeNull();

    fireEvent.change(screen.getByTestId("employee-type-select"), { target: { value: "contractor" } });

    expect(screen.queryByTestId("full-time-fields")).toBeNull();
    expect(screen.getByTestId("contractor-fields")).toBeTruthy();
  });

  it("changing to part_time reveals part-time fields", () => {
    render(<HeadcountForm departments={departments} open={true} />);
    fireEvent.change(screen.getByTestId("employee-type-select"), { target: { value: "part_time" } });
    expect(screen.getByTestId("part-time-fields")).toBeTruthy();
    expect(screen.queryByTestId("full-time-fields")).toBeNull();
    expect(screen.queryByTestId("contractor-fields")).toBeNull();
  });

  it("changing back to full_time restores full-time fields", () => {
    render(<HeadcountForm departments={departments} open={true} />);
    fireEvent.change(screen.getByTestId("employee-type-select"), { target: { value: "contractor" } });
    fireEvent.change(screen.getByTestId("employee-type-select"), { target: { value: "full_time" } });
    expect(screen.getByTestId("full-time-fields")).toBeTruthy();
    expect(screen.queryByTestId("contractor-fields")).toBeNull();
  });

  it("BenefitsBreakdownEditor 'Use company defaults' resets to provided defaults", () => {
    const defaults = { insuranceBenefitsCost: 0.05 };
    render(
      <HeadcountForm
        departments={departments}
        companyBenefitsRates={defaults}
        open={true}
      />,
    );
    const editor = screen.getByTestId("benefits-breakdown-editor");
    // Clear first
    fireEvent.click(within(editor).getByTestId("clear-breakdown"));
    expect(within(editor).getByTestId("breakdown-total").textContent).toContain("0.00%");

    // Apply company defaults
    fireEvent.click(within(editor).getByTestId("use-company-defaults"));
    expect(within(editor).getByTestId("breakdown-total").textContent).toContain("5.00%");
  });

  it("validates and surfaces errors for missing salary on full_time", async () => {
    render(<HeadcountForm departments={departments} open={true} />);
    // Default salary=0, full_time → should fail validation
    fireEvent.change(screen.getByTestId("employee-type-select"), { target: { value: "full_time" } });
    // Title is empty by default → also fails
    fireEvent.click(screen.getByTestId("save-headcount"));
    // Find inline errors
    const alerts = screen.queryAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
  });

  it("submits with normalized payload for contractor (salary=0, hourlyRate set)", async () => {
    const apiFetch = (await import("@/lib/api-fetch")).apiFetch as ReturnType<typeof vi.fn>;
    apiFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    render(
      <HeadcountForm
        departments={departments}
        open={true}
        edit={{
          id: "h-2",
          departmentId: "d1",
          title: "Contractor",
          employeeType: "contractor",
          count: 1,
          salary: 0,
          hourlyRate: 80,
          hoursPerWeek: 25,
          startDate: "2026-06-01",
          benefitsRate: 0.1,
        }}
      />,
    );

    fireEvent.click(screen.getByTestId("save-headcount"));
    // Wait microtask
    await new Promise((r) => setTimeout(r, 0));

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = apiFetch.mock.calls[0]!;
    expect(url).toBe("/api/headcount/h-2");
    expect(init.method).toBe("PATCH");
    const body = JSON.parse(init.body as string);
    expect(body.employeeType).toBe("contractor");
    expect(body.salary).toBe(0);
    expect(body.hourlyRate).toBe(80);
    expect(body.hoursPerWeek).toBe(25);
    // No breakdown configured → parameters.benefitsBreakdown should NOT be present
    expect(body.parameters).toEqual({});
  });

  it("submits with parameters.benefitsBreakdown only when set", async () => {
    const apiFetch = (await import("@/lib/api-fetch")).apiFetch as ReturnType<typeof vi.fn>;
    apiFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    render(
      <HeadcountForm
        departments={departments}
        open={true}
        companyBenefitsRates={{ insuranceBenefitsCost: 0.05 }}
        edit={{
          id: "h-3",
          departmentId: "d1",
          title: "Engineer",
          employeeType: "full_time",
          count: 1,
          salary: 100_000,
          hourlyRate: null,
          hoursPerWeek: null,
          startDate: "2026-06-01",
          benefitsRate: 0.2,
          parameters: { benefitsBreakdown: { insuranceBenefitsCost: 0.07 } },
        }}
      />,
    );

    fireEvent.click(screen.getByTestId("save-headcount"));
    await new Promise((r) => setTimeout(r, 0));

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [, init] = apiFetch.mock.calls[0]!;
    const body = JSON.parse(init.body as string);
    expect(body.parameters).toEqual({ benefitsBreakdown: { insuranceBenefitsCost: 0.07 } });
  });
});
