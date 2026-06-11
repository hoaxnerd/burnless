import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { apiFetch } from "@/lib/api-fetch";
import { FundingStep } from "../funding-step";

vi.mock("@/lib/api-fetch", () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "x" }) }),
}));

describe("FundingStep", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockClear();
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "x" }),
    } as Response);
  });

  const suggestions = [
    {
      name: "Seed",
      roundType: "seed" as const,
      amount: 1500000,
      date: "2024-06-01",
      closeDate: null,
      notes: null,
      parameters: {},
      isProjected: false,
    },
  ];

  it("shows a Seed funding-round draft card and the cap-table add-share-class control", () => {
    render(<FundingStep suggestions={suggestions} />);
    expect(screen.getByText("Seed")).toBeTruthy();
    expect(screen.getByRole("button", { name: /add share class/i })).toBeTruthy();
  });

  it("hides the Add option pool control after a pool is added (single-pool guard)", async () => {
    render(<FundingStep suggestions={suggestions} />);

    // Add-option-pool control is present initially.
    expect(screen.getByRole("button", { name: /add option pool/i })).toBeTruthy();

    // Open the option-pool fields.
    fireEvent.click(screen.getByRole("button", { name: /add option pool/i }));

    // Real OptionPoolFormFields renders a Name field + a Save button.
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Employee Pool" } });
    fireEvent.click(screen.getByTestId("submit-option-pool"));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const call = vi.mocked(apiFetch).mock.calls[0]!;
    expect(call[0]).toBe("/api/option-pools");
    expect(call[1]?.method).toBe("POST");

    // Single-pool guard: the add-option-pool affordance is gone.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /add option pool/i })).toBeNull(),
    );
  });
});
