import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CompanyStep } from "../company-step";

vi.mock("@/lib/api-fetch", () => ({ apiFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ companyId: "c1" }) }) }));

describe("CompanyStep", () => {
  it("blocks create when name empty, creates company when valid", async () => {
    const onCreated = vi.fn();
    render(<CompanyStep initial={{ company_name: "" }} onCreated={onCreated} />);
    fireEvent.click(screen.getByTestId("company-continue"));
    expect(onCreated).not.toHaveBeenCalled();           // name empty → blocked
    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: "Acme" } });
    fireEvent.click(screen.getByTestId("company-continue"));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("c1"));
  });
});
