import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireCompanyAccess } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn().mockResolvedValue({ userId: "u1", companyId: "c1" }),
}));
vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  withErrorHandler: (fn: unknown) => fn,
}));

const { mockList, mockUnread, mockMarkRead } = vi.hoisted(() => ({
  mockList: vi.fn().mockResolvedValue([{ id: "n1", title: "hi", readAt: null }]),
  mockUnread: vi.fn().mockResolvedValue(3),
  mockMarkRead: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@burnless/db", () => ({
  listNotificationsForUser: mockList,
  countUnreadNotifications: mockUnread,
  markNotificationsRead: mockMarkRead,
}));

import { GET, PATCH } from "../route";

describe("/api/notifications", () => {
  beforeEach(() => { vi.clearAllMocks(); mockRequireCompanyAccess.mockResolvedValue({ userId: "u1", companyId: "c1" }); });

  it("GET returns notifications + unreadCount for the caller", async () => {
    const res = await GET(new Request("http://x/api/notifications"));
    const body = await res.json();
    expect(mockList).toHaveBeenCalledWith("u1", "c1", expect.any(Number));
    expect(body.unreadCount).toBe(3);
    expect(body.notifications).toHaveLength(1);
  });

  it("PATCH { markAllRead: true } marks all read", async () => {
    const res = await PATCH(new Request("http://x/api/notifications", { method: "PATCH", body: JSON.stringify({ markAllRead: true }) }));
    expect(res.status).toBe(200);
    expect(mockMarkRead).toHaveBeenCalledWith("u1", "c1", { all: true });
  });

  it("PATCH { ids } marks a subset read", async () => {
    await PATCH(new Request("http://x/api/notifications", { method: "PATCH", body: JSON.stringify({ ids: ["n1"] }) }));
    expect(mockMarkRead).toHaveBeenCalledWith("u1", "c1", { ids: ["n1"] });
  });

  it("propagates the auth error response", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ error: new Response("nope", { status: 401 }) });
    const res = await GET(new Request("http://x/api/notifications"));
    expect(res.status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
  });
});
