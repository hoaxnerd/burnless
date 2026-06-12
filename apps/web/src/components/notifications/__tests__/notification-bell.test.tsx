import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { mockUseNotifications, mockApiFetch } = vi.hoisted(() => ({
  mockUseNotifications: vi.fn(),
  mockApiFetch: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/swr/hooks", () => ({ useNotifications: mockUseNotifications }));
vi.mock("@/lib/api-fetch", () => ({ apiFetch: mockApiFetch }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { NotificationBell } from "../notification-bell";

const mutate = vi.fn();
function withData(unreadCount: number, notifications: unknown[] = []) {
  mockUseNotifications.mockReturnValue({ data: { unreadCount, notifications }, mutate, isLoading: false });
}

describe("NotificationBell", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("shows the unread dot when unreadCount > 0", () => {
    withData(2);
    render(<NotificationBell />);
    expect(screen.getByTestId("notif-unread-dot")).toBeTruthy();
  });

  it("hides the unread dot when there are no unread", () => {
    withData(0);
    render(<NotificationBell />);
    expect(screen.queryByTestId("notif-unread-dot")).toBeNull();
  });

  it("opens the panel and lists notifications on click", () => {
    withData(1, [{ id: "n1", category: "automation", title: "Job ran", body: "MRR updated", severity: "success", link: "/automations", readAt: null, createdAt: new Date().toISOString() }]);
    render(<NotificationBell />);
    fireEvent.click(screen.getByLabelText("Notifications"));
    expect(screen.getByText("Job ran")).toBeTruthy();
  });

  it("revalidates (mutate) when the panel is opened", () => {
    withData(1, [{ id: "n1", category: "c", title: "t", body: null, severity: "info", link: null, readAt: null, createdAt: new Date().toISOString() }]);
    render(<NotificationBell />);
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Notifications"));
    expect(mutate).toHaveBeenCalled();
  });

  it("Mark all read PATCHes and revalidates", async () => {
    withData(1, [{ id: "n1", category: "c", title: "t", body: null, severity: "info", link: null, readAt: null, createdAt: new Date().toISOString() }]);
    render(<NotificationBell />);
    fireEvent.click(screen.getByLabelText("Notifications"));
    fireEvent.click(screen.getByText("Mark all read"));
    expect(mockApiFetch).toHaveBeenCalledWith("/api/notifications", expect.objectContaining({ method: "PATCH" }));
  });
});
