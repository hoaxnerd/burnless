import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
const { useAutomations, apiFetch } = vi.hoisted(() => ({ useAutomations: vi.fn(), apiFetch: vi.fn() }));
vi.mock("@/lib/swr/hooks", () => ({ useAutomations }));
vi.mock("@/lib/api-fetch", () => ({ apiFetch }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
import { AutomationsView } from "../automations-view";

const job = { id: "j1", name: "Sync", prompt: "p", actionKind: "notify", allowedTools: [], boundConnectionIds: [], schedule: "0 8 * * *", timezone: "UTC", enabled: true, status: "active", notifyPolicy: "smart", consecutiveFailures: 0, lastRunAt: null, nextRunAt: null, createdAt: "2026-06-01T00:00:00Z" };

describe("AutomationsView", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("shows the empty state with a New-job CTA when there are no jobs", () => {
    useAutomations.mockReturnValue({ data: { jobs: [] }, mutate: vi.fn(), isLoading: false });
    render(<AutomationsView />);
    expect(screen.getByText(/No automations yet/i)).toBeTruthy();
  });
  it("lists jobs and toggling a job PATCHes + revalidates", async () => {
    const mutate = vi.fn();
    useAutomations.mockReturnValue({ data: { jobs: [job] }, mutate, isLoading: false });
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    render(<AutomationsView />);
    expect(screen.getByText("Sync")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/automations/j1", expect.objectContaining({ method: "PATCH" })));
    await waitFor(() => expect(mutate).toHaveBeenCalled());
  });
});
