// __tests__/propose-scheduled-job.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api-fetch", () => ({ apiFetch }));
const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("swr", async (importOriginal) => {
  const actual = await importOriginal<typeof import("swr")>();
  return { ...actual, useSWRConfig: () => ({ ...actual.useSWRConfig(), mutate }) };
});
import { GenProposeScheduledJob } from "../propose-scheduled-job";
import { KEYS } from "@/lib/swr/keys";

const props = {
  name: "Weekly Stripe revenue sync",
  prompt: "Pull last week's Stripe revenue and update Subscriptions MRR.",
  schedule: "0 9 * * 1",
  scheduleLabel: "Every Monday at 9:00 AM",
  actionKind: "write" as const,
  whatItDoes: "Fetch last week's Stripe charges and update Subscriptions MRR.",
  dryRunPreview: "Fetched $12,480. Would set Subscriptions MRR 11,900 → 12,480.",
  allowedTools: [
    { name: "mcp__stripe__list_charges", perm: "read" as const, category: "connectors" as const, connectorLabel: "Stripe" },
    { name: "update_revenue_stream", perm: "write" as const, category: "workspace" as const },
  ],
  boundConnectionIds: [],
};

describe("GenProposeScheduledJob", () => {
  beforeEach(() => { apiFetch.mockReset(); mutate.mockReset(); });

  it("renders name, schedule label, dry-run preview, allowlist chips + write tag", () => {
    render(<GenProposeScheduledJob {...props} />);
    expect(screen.getByText("Weekly Stripe revenue sync")).toBeTruthy();
    expect(screen.getByText(/Every Monday at 9:00 AM/)).toBeTruthy();
    expect(screen.getByText(/12,480/)).toBeTruthy();
    expect(screen.getByText("update_revenue_stream")).toBeTruthy();
    expect(screen.getByText(/writes data/i)).toBeTruthy();
  });

  it("Confirm & schedule POSTs to /api/automations with the draft", async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({ job: { id: "new" } }) });
    render(<GenProposeScheduledJob {...props} />);
    fireEvent.click(screen.getByText(/Confirm & schedule/i));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/automations", expect.objectContaining({ method: "POST" })));
    const sent = JSON.parse((apiFetch.mock.calls[0]![1] as RequestInit).body as string);
    expect(sent.allowedTools).toEqual(["mcp__stripe__list_charges", "update_revenue_stream"]);
    expect(sent.schedule).toBe("0 9 * * 1");
    expect(sent.actionKind).toBe("write");
    await waitFor(() => expect(screen.getByText(/scheduled/i)).toBeTruthy());
  });

  it("revalidates the automations list after a successful Confirm", async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({ job: { id: "new" } }) });
    render(<GenProposeScheduledJob {...props} />);
    fireEvent.click(screen.getByText(/Confirm & schedule/i));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith(KEYS.automations));
  });

  it("does NOT revalidate the automations list when Confirm fails", async () => {
    apiFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<GenProposeScheduledJob {...props} />);
    fireEvent.click(screen.getByText(/Confirm & schedule/i));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(mutate).not.toHaveBeenCalled();
  });

  it("Run for real now POSTs to /api/automations/run-draft", async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({ response: "Set MRR to $12,480." }) });
    render(<GenProposeScheduledJob {...props} />);
    fireEvent.click(screen.getByText(/Run for real now/i));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/automations/run-draft", expect.objectContaining({ method: "POST" })));
  });

  it("removing an allowlist chip drops it from the Confirm payload", async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({ job: { id: "n" } }) });
    render(<GenProposeScheduledJob {...props} />);
    fireEvent.click(screen.getByLabelText("Remove update_revenue_stream"));
    fireEvent.click(screen.getByText(/Confirm & schedule/i));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const sent = JSON.parse((apiFetch.mock.calls[0]![1] as RequestInit).body as string);
    expect(sent.allowedTools).toEqual(["mcp__stripe__list_charges"]);
  });
});
