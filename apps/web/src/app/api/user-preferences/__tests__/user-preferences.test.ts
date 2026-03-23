import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

const {
  mockSelect, mockFrom, mockWhere, mockLimit,
  mockInsert, mockValues, mockReturning,
  mockUpdate, mockSet, mockUpdateWhere, mockUpdateReturning,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
  mockReturning: vi.fn(),
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockUpdateReturning: vi.fn(),
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
  userPreferences: {
    id: "id",
    userId: "userId",
    companyId: "companyId",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

import { GET, PATCH } from "../route";

describe("/api/user-preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "u1",
      companyId: "c1",
      role: "owner",
    });

    // Select chain
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });

    // Insert chain
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });

    // Update chain
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });
  });

  describe("GET", () => {
    it("returns saved preferences when they exist", async () => {
      const prefs = {
        id: "pref-1",
        sidebarOrder: ["dashboard", "expenses", "revenue"],
        quickActionMode: "intelligence",
        sidebarCollapsed: true,
        customQuickActions: ["add-expense"],
      };
      mockLimit.mockResolvedValue([prefs]);

      const res = await GET();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.sidebarOrder).toEqual(["dashboard", "expenses", "revenue"]);
      expect(body.quickActionMode).toBe("intelligence");
      expect(body.sidebarCollapsed).toBe(true);
    });

    it("returns defaults when no preferences exist", async () => {
      mockLimit.mockResolvedValue([]);

      const res = await GET();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.sidebarOrder).toBeNull();
      expect(body.quickActionMode).toBe("dynamic");
      expect(body.sidebarCollapsed).toBe(false);
      expect(body.customQuickActions).toBeNull();
    });

    it("returns auth error when not authenticated", async () => {
      mockRequireCompanyAccess.mockResolvedValue({
        error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      });

      const res = await GET();
      expect(res.status).toBe(401);
    });
  });

  describe("PATCH", () => {
    it("updates existing preferences", async () => {
      // Select for existence check
      mockLimit.mockResolvedValue([{ id: "pref-1" }]);
      const updated = { id: "pref-1", quickActionMode: "custom", sidebarCollapsed: true };
      mockUpdateReturning.mockResolvedValue([updated]);

      const req = new Request("http://localhost:3000/api/user-preferences", {
        method: "PATCH",
        body: JSON.stringify({ quickActionMode: "custom", sidebarCollapsed: true }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await PATCH(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.quickActionMode).toBe("custom");
      expect(body.sidebarCollapsed).toBe(true);
    });

    it("creates preferences when none exist", async () => {
      mockLimit.mockResolvedValue([]);
      const created = { id: "new-1", quickActionMode: "intelligence", sidebarOrder: ["dashboard"] };
      mockReturning.mockResolvedValue([created]);

      const req = new Request("http://localhost:3000/api/user-preferences", {
        method: "PATCH",
        body: JSON.stringify({ quickActionMode: "intelligence", sidebarOrder: ["dashboard"] }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await PATCH(req);
      expect(res.status).toBe(201);
    });

    it("accepts sidebar order as array of strings", async () => {
      mockLimit.mockResolvedValue([{ id: "pref-1" }]);
      const updated = { id: "pref-1", sidebarOrder: ["expenses", "revenue", "team"] };
      mockUpdateReturning.mockResolvedValue([updated]);

      const req = new Request("http://localhost:3000/api/user-preferences", {
        method: "PATCH",
        body: JSON.stringify({ sidebarOrder: ["expenses", "revenue", "team"] }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await PATCH(req);
      const body = await res.json();

      expect(body.sidebarOrder).toEqual(["expenses", "revenue", "team"]);
    });

    it("accepts null sidebar order to reset", async () => {
      mockLimit.mockResolvedValue([{ id: "pref-1" }]);
      const updated = { id: "pref-1", sidebarOrder: null };
      mockUpdateReturning.mockResolvedValue([updated]);

      const req = new Request("http://localhost:3000/api/user-preferences", {
        method: "PATCH",
        body: JSON.stringify({ sidebarOrder: null }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await PATCH(req);
      const body = await res.json();

      expect(body.sidebarOrder).toBeNull();
    });

    it("accepts quickActionModeOverrides as record", async () => {
      mockLimit.mockResolvedValue([{ id: "pref-1" }]);
      const overrides = { dashboard: "intelligence", expenses: "custom" };
      const updated = { id: "pref-1", quickActionModeOverrides: overrides };
      mockUpdateReturning.mockResolvedValue([updated]);

      const req = new Request("http://localhost:3000/api/user-preferences", {
        method: "PATCH",
        body: JSON.stringify({ quickActionModeOverrides: overrides }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await PATCH(req);
      const body = await res.json();

      expect(body.quickActionModeOverrides).toEqual(overrides);
    });

    it("rejects invalid quickActionMode values", async () => {
      const req = new Request("http://localhost:3000/api/user-preferences", {
        method: "PATCH",
        body: JSON.stringify({ quickActionMode: "invalid_mode" }),
        headers: { "Content-Type": "application/json" },
      });

      await expect(PATCH(req)).rejects.toThrow();
    });

    it("returns auth error when not authenticated", async () => {
      mockRequireCompanyAccess.mockResolvedValue({
        error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      });

      const req = new Request("http://localhost:3000/api/user-preferences", {
        method: "PATCH",
        body: JSON.stringify({ sidebarCollapsed: true }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await PATCH(req);
      expect(res.status).toBe(401);
    });
  });
});
