import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AutomationEditModal } from "../automation-edit-modal";

const job = {
  id: "j1",
  name: "Weekly Stripe revenue sync",
  prompt: "Pull last week's Stripe revenue and update the Subscriptions revenue stream",
  actionKind: "write" as const,
  allowedTools: ["mcp__stripe__list_charges", "update_revenue_stream"],
  boundConnectionIds: ["conn1"],
  schedule: "0 9 * * 1",
  timezone: "UTC",
  enabled: true,
  status: "active" as const,
  notifyPolicy: "smart" as const,
  consecutiveFailures: 0,
  lastRunAt: null,
  nextRunAt: null,
  createdAt: "2026-06-01T00:00:00Z",
};

describe("AutomationEditModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("seeds fields from the job and shows actionKind as a read-only badge", () => {
    render(<AutomationEditModal open job={job} onClose={() => {}} onSave={() => {}} />);
    expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe(
      "Weekly Stripe revenue sync",
    );
    // actionKind is intrinsic — shown, not editable
    expect(screen.getByText(/writes data/i)).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: /action kind/i })).toBeNull();
  });

  it("editing the name and clicking Save calls onSave with the patch", async () => {
    const onSave = vi.fn();
    render(<AutomationEditModal open job={job} onClose={() => {}} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "Renamed job" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const patch = onSave.mock.calls[0]![0];
    expect(patch.name).toBe("Renamed job");
    expect(patch.prompt).toBe(job.prompt);
    expect(patch.schedule).toBe("0 9 * * 1");
    expect(patch.notifyPolicy).toBe("smart");
  });
});
