import { createRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { apiFetch } from "@/lib/api-fetch";
import { FundingStep } from "../funding-step";
import type { WizardStepHandle } from "../../types";

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

  it("#7 submit() auto-saves every un-saved funding-round draft and returns true", async () => {
    const ref = createRef<WizardStepHandle>();
    render(<FundingStep ref={ref} suggestions={suggestions} />);

    const result = await ref.current!.submit();
    expect(result).toBe(true);

    const posted = vi
      .mocked(apiFetch)
      .mock.calls.find(
        ([u, init]) => String(u) === "/api/funding-rounds" && init?.method === "POST",
      );
    expect(posted).toBeTruthy();
    const body = JSON.parse(posted![1]?.body as string);
    expect(body.name).toBe("Seed");

    // After auto-save the round row is "Saved" and still editable (#5).
    await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy());
  });

  it("#5 a saved share class exposes an Edit control that PATCHes /api/share-classes/{id}", async () => {
    render(<FundingStep suggestions={suggestions} />);

    // Add a share class.
    fireEvent.click(screen.getByRole("button", { name: /add share class/i }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Common A" } });
    fireEvent.click(screen.getByTestId("submit-share-class"));

    await waitFor(() =>
      expect(
        vi
          .mocked(apiFetch)
          .mock.calls.find(
            ([u, init]) => String(u) === "/api/share-classes" && init?.method === "POST",
          ),
      ).toBeTruthy(),
    );

    // The saved share-class row now exposes its own Edit control. The cap-table
    // section renders after funding rounds, so the share-class Edit is the last
    // Edit button (the Seed round row also has Edit).
    await screen.findByText("Common A");
    const editButtons = screen.getAllByRole("button", { name: /edit/i });
    fireEvent.click(editButtons[editButtons.length - 1]!);

    // Re-submit → PATCH /api/share-classes/{id}.
    fireEvent.click(screen.getByTestId("submit-share-class"));
    await waitFor(() => {
      const patched = vi
        .mocked(apiFetch)
        .mock.calls.find(
          ([u, init]) =>
            String(u).startsWith("/api/share-classes/") && init?.method === "PATCH",
        );
      expect(patched).toBeTruthy();
    });
  });
});
