import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { apiFetch } from "@/lib/api-fetch";
import { RevenueStep } from "../revenue-step";

vi.mock("@/lib/api-fetch", () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "r1" }) }),
}));

describe("RevenueStep", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockClear();
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "r1" }),
    } as Response);
  });

  it("shows AI draft cards from suggestions", () => {
    render(
      <RevenueStep
        suggestions={[
          {
            name: "Pro",
            type: "subscription",
            startDate: "2025-01-01",
            endDate: null,
            parameters: {},
          },
        ]}
      />,
    );
    expect(screen.getByText("Pro")).toBeTruthy();
  });

  it("opens the add form and POSTs /api/revenue-streams on submit", async () => {
    render(
      <RevenueStep
        suggestions={[
          {
            name: "Pro",
            type: "subscription",
            startDate: "2025-01-01",
            endDate: null,
            parameters: {},
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /add a revenue stream/i }));

    // Real RevenueStreamForm renders with a Name field.
    fireEvent.change(screen.getByLabelText(/revenue stream name/i), {
      target: { value: "Enterprise" },
    });

    fireEvent.click(screen.getByRole("button", { name: /add stream/i }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const call = vi.mocked(apiFetch).mock.calls[0]!;
    const url = call[0];
    const init = call[1];
    expect(url).toBe("/api/revenue-streams");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(init?.body as string);
    expect(body.name).toBe("Enterprise");
  });
});
