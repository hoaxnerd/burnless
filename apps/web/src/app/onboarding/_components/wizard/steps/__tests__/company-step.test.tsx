import { createRef } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { CompanyStep } from "../company-step";
import type { WizardStepHandle } from "../../types";

vi.mock("@/lib/api-fetch", () => ({ apiFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ companyId: "c1" }) }) }));

describe("CompanyStep", () => {
  it("submit() blocks create when name empty, creates company when valid", async () => {
    const onCreated = vi.fn();
    const ref = createRef<WizardStepHandle>();
    // The step renders only fields now — the global shell Continue drives
    // submit() via the imperative handle, so the unit test calls it directly.
    render(<CompanyStep ref={ref} initial={{ company_name: "" }} onCreated={onCreated} />);

    // Name empty → submit() returns false and does not create.
    let result: boolean | undefined;
    await act(async () => {
      result = await ref.current!.submit();
    });
    expect(result).toBe(false);
    expect(onCreated).not.toHaveBeenCalled();

    // Name filled → submit() returns true and creates the company.
    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: "Acme" } });
    await act(async () => {
      result = await ref.current!.submit();
    });
    expect(result).toBe(true);
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("c1"));
  });
});
