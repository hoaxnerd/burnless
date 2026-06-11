import { createRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { apiFetch } from "@/lib/api-fetch";
import { TeamStep } from "../team-step";
import type { WizardStepHandle } from "../../types";
import type { EditableHeadcount } from "@/app/(dashboard)/team/headcount-form";

vi.mock("@/lib/api-fetch", () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "h1" }) }),
}));

const departments = [{ id: "d1", name: "Engineering" }];

const suggestion: EditableHeadcount = {
  id: "draft-1",
  departmentId: "d1",
  title: "Engineer",
  name: "",
  employeeType: "full_time",
  count: 1,
  salary: 100000,
  hourlyRate: null,
  hoursPerWeek: null,
  startDate: "2025-01-01",
  endDate: null,
  benefitsRate: 0.2,
  parameters: null,
};

describe("TeamStep", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockClear();
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "h1" }),
    } as Response);
  });

  it("shows AI draft cards from suggestions", () => {
    render(<TeamStep departments={departments} suggestions={[suggestion]} />);
    expect(screen.getByText("Engineer")).toBeTruthy();
  });

  it("opens the form and POSTs /api/headcount on submit", async () => {
    render(<TeamStep departments={departments} suggestions={[suggestion]} />);

    // Open the draft via Edit — HeadcountFormBody renders pre-filled (valid salary).
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));

    // Save is a real type="button" with this testid (clickable in happy-dom).
    fireEvent.click(screen.getByTestId("save-headcount"));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const call = vi.mocked(apiFetch).mock.calls[0]!;
    expect(call[0]).toBe("/api/headcount");
    expect(call[1]?.method).toBe("POST");
    const body = JSON.parse(call[1]?.body as string);
    expect(body.title).toBe("Engineer");
  });

  it("#7 submit() auto-saves every un-saved suggestion (POST) and returns true", async () => {
    const ref = createRef<WizardStepHandle>();
    render(<TeamStep ref={ref} departments={departments} suggestions={[suggestion]} />);

    const result = await ref.current!.submit();
    expect(result).toBe(true);

    const posted = vi
      .mocked(apiFetch)
      .mock.calls.find(
        ([u, init]) => String(u) === "/api/headcount" && init?.method === "POST",
      );
    expect(posted).toBeTruthy();
    const body = JSON.parse(posted![1]?.body as string);
    expect(body.title).toBe("Engineer");

    // After auto-save the row is "Saved" and still editable (#5).
    await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy());
    expect(screen.getByRole("button", { name: /edit/i })).toBeTruthy();
  });

  it("#7 submit() POSTs a normalized payload with a resolved departmentId", async () => {
    const ref = createRef<WizardStepHandle>();
    // Suggestion carries a resolved departmentId (the page's toHeadcountSuggestions
    // resolves the AI role's department NAME against the loaded departments before
    // it reaches the step) and a contractor type to exercise normalization.
    const contractor: EditableHeadcount = {
      ...suggestion,
      departmentId: "d1",
      title: "Contract Designer",
      employeeType: "contractor",
      salary: 99999, // contractor → normalizer forces salary to 0
      hourlyRate: 80,
      hoursPerWeek: 30,
    };
    render(<TeamStep ref={ref} departments={departments} suggestions={[contractor]} />);

    const result = await ref.current!.submit();
    expect(result).toBe(true);

    const posted = vi
      .mocked(apiFetch)
      .mock.calls.find(
        ([u, init]) => String(u) === "/api/headcount" && init?.method === "POST",
      );
    expect(posted).toBeTruthy();
    const body = JSON.parse(posted![1]?.body as string);

    // departmentId resolved to a real department, not blank.
    expect(body.departmentId).toBe("d1");
    expect(body.departmentId).not.toBe("");
    expect(body.title).toBe("Contract Designer");
    // normalizeHeadcountPayload zeroes contractor salary + keeps hourly fields.
    expect(body.salary).toBe(0);
    expect(body.hourlyRate).toBe(80);
    expect(body.hoursPerWeek).toBe(30);
  });

  it("#7 submit() returns false when a POST fails", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "boom" }),
      text: async () => "boom",
    } as Response);

    const ref = createRef<WizardStepHandle>();
    render(<TeamStep ref={ref} departments={departments} suggestions={[suggestion]} />);

    const result = await ref.current!.submit();
    expect(result).toBe(false);
  });
});
