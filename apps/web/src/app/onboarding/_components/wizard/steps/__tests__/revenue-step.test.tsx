import { createRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { apiFetch } from "@/lib/api-fetch";
import { RevenueStep } from "../revenue-step";
import type { WizardStepHandle } from "../../types";

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

  it("#7 submit() auto-saves every un-saved suggestion (POST) and returns true", async () => {
    const ref = createRef<WizardStepHandle>();
    render(
      <RevenueStep
        ref={ref}
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

    const result = await ref.current!.submit();
    expect(result).toBe(true);

    const posted = vi
      .mocked(apiFetch)
      .mock.calls.find(
        ([u, init]) => String(u) === "/api/revenue-streams" && init?.method === "POST",
      );
    expect(posted).toBeTruthy();
    const body = JSON.parse(posted![1]?.body as string);
    expect(body.name).toBe("Pro");

    // After auto-save the row is "Saved" and still editable (#5).
    await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy());
    expect(screen.getByRole("button", { name: /edit/i })).toBeTruthy();
  });

  it("#7 submit() returns false and surfaces an error when a POST fails", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "boom" }),
      text: async () => "boom",
    } as Response);

    const ref = createRef<WizardStepHandle>();
    render(
      <RevenueStep
        ref={ref}
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

    const result = await ref.current!.submit();
    expect(result).toBe(false);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  });
});
