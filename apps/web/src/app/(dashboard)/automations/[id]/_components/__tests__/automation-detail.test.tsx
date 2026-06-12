import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { useAutomation, apiFetch } = vi.hoisted(() => ({
  useAutomation: vi.fn(),
  apiFetch: vi.fn(),
}));
vi.mock("@/lib/swr/hooks", () => ({ useAutomation }));
vi.mock("@/lib/api-fetch", () => ({ apiFetch }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { AutomationDetail } from "../automation-detail";

const job = {
  id: "j1",
  name: "Weekly Stripe revenue sync",
  prompt: "Pull last week's Stripe revenue and update Subscriptions MRR",
  actionKind: "write" as const,
  allowedTools: ["mcp__stripe__list_charges", "update_revenue_stream"],
  boundConnectionIds: ["conn1"],
  schedule: "0 9 * * 1",
  timezone: "UTC",
  enabled: true,
  status: "active" as const,
  notifyPolicy: "smart" as const,
  consecutiveFailures: 0,
  lastRunAt: "2026-06-08T09:00:00Z",
  nextRunAt: "2999-01-01T09:00:00Z",
  createdAt: "2026-06-01T00:00:00Z",
};

const runs = [
  {
    id: "r1",
    status: "success" as const,
    trigger: "schedule" as const,
    startedAt: "2026-06-08T09:00:00Z",
    finishedAt: "2026-06-08T09:00:02Z",
    durationMs: 2400,
    tokensUsed: 1820,
    summary: "Set Subscriptions MRR 11,900 to 12,480.",
    output: { mrr: 12480 },
    error: null,
  },
];

describe("AutomationDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the job name + humanized schedule", () => {
    useAutomation.mockReturnValue({ data: { job, runs }, mutate: vi.fn(), isLoading: false });
    render(<AutomationDetail id="j1" />);
    expect(screen.getByText("Weekly Stripe revenue sync")).toBeTruthy();
    expect(screen.getByText(/Every Monday/)).toBeTruthy();
  });

  it("lists a success run with its summary + a duration", () => {
    useAutomation.mockReturnValue({ data: { job, runs }, mutate: vi.fn(), isLoading: false });
    render(<AutomationDetail id="j1" />);
    expect(screen.getByText(/Set Subscriptions MRR 11,900 to 12,480\./)).toBeTruthy();
    expect(screen.getByText(/2\.4s/)).toBeTruthy();
  });

  it("shows an empty state when there are no runs", () => {
    useAutomation.mockReturnValue({ data: { job, runs: [] }, mutate: vi.fn(), isLoading: false });
    render(<AutomationDetail id="j1" />);
    expect(screen.getByText(/No runs yet/i)).toBeTruthy();
  });

  it("Run now POSTs to /api/automations/j1/run then revalidates", async () => {
    const mutate = vi.fn();
    useAutomation.mockReturnValue({ data: { job, runs }, mutate, isLoading: false });
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    render(<AutomationDetail id="j1" />);
    fireEvent.click(screen.getByText(/Run now/i));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/automations/j1/run",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() => expect(mutate).toHaveBeenCalled());
  });
});
