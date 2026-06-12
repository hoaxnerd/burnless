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
  mockInsert, mockValues, mockOnConflict, mockReturning,
  mockUpdate,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
  mockOnConflict: vi.fn(),
  mockReturning: vi.fn(),
  mockUpdate: vi.fn(),
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

    // Select chain (GET path)
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });

    // Insert → onConflictDoUpdate → returning chain (PATCH atomic upsert)
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflict });
    mockOnConflict.mockReturnValue({ returning: mockReturning });
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
    // SHELL-01: PATCH is now a single atomic onConflictDoUpdate upsert. It must NOT
    // do a prior SELECT (that race 500s when concurrent first-writes collide on the
    // unique index), and it returns a uniform 200 for both create and update.
    it("upserts atomically via onConflictDoUpdate (no prior SELECT) and returns 200", async () => {
      const upserted = { id: "pref-1", quickActionMode: "custom", sidebarCollapsed: true };
      mockReturning.mockResolvedValue([upserted]);

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

      // No existence SELECT — the upsert is the only DB call.
      expect(mockSelect).not.toHaveBeenCalled();
      expect(mockInsert).toHaveBeenCalledTimes(1);
      expect(mockOnConflict).toHaveBeenCalledTimes(1);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("targets the (userId, companyId) unique index and sets only provided keys", async () => {
      mockReturning.mockResolvedValue([{ id: "pref-1", sidebarCollapsed: true }]);

      const req = new Request("http://localhost:3000/api/user-preferences", {
        method: "PATCH",
        body: JSON.stringify({ sidebarCollapsed: true }),
        headers: { "Content-Type": "application/json" },
      });

      await PATCH(req);

      const conflictArg = mockOnConflict.mock.calls[0]![0];
      expect(conflictArg.target).toEqual(["userId", "companyId"]);
      // Partial-PATCH semantics: set only the provided key, nothing else.
      expect(conflictArg.set).toEqual({ sidebarCollapsed: true });
    });

    it("returns 200 (not 201) even when the row is newly created", async () => {
      const created = { id: "new-1", quickActionMode: "intelligence", sidebarOrder: ["dashboard"] };
      mockReturning.mockResolvedValue([created]);

      const req = new Request("http://localhost:3000/api/user-preferences", {
        method: "PATCH",
        body: JSON.stringify({ quickActionMode: "intelligence", sidebarOrder: ["dashboard"] }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);
    });

    it("accepts sidebar order as array of strings", async () => {
      const upserted = { id: "pref-1", sidebarOrder: ["expenses", "revenue", "team"] };
      mockReturning.mockResolvedValue([upserted]);

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
      const upserted = { id: "pref-1", sidebarOrder: null };
      mockReturning.mockResolvedValue([upserted]);

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
      const overrides = { dashboard: "intelligence", expenses: "custom" };
      const upserted = { id: "pref-1", quickActionModeOverrides: overrides };
      mockReturning.mockResolvedValue([upserted]);

      const req = new Request("http://localhost:3000/api/user-preferences", {
        method: "PATCH",
        body: JSON.stringify({ quickActionModeOverrides: overrides }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await PATCH(req);
      const body = await res.json();

      expect(body.quickActionModeOverrides).toEqual(overrides);
    });

    // D11: per-user MCP kill-switch list rides the same upsert.
    it("accepts disabledMcpConnections as array of connection ids", async () => {
      const upserted = { id: "pref-1", disabledMcpConnections: ["c1", "c2"] };
      mockReturning.mockResolvedValue([upserted]);

      const req = new Request("http://localhost:3000/api/user-preferences", {
        method: "PATCH",
        body: JSON.stringify({ disabledMcpConnections: ["c1", "c2"] }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await PATCH(req);
      const body = await res.json();

      expect(body.disabledMcpConnections).toEqual(["c1", "c2"]);
      const conflictArg = mockOnConflict.mock.calls[0]![0];
      expect(conflictArg.set).toEqual({ disabledMcpConnections: ["c1", "c2"] });
    });

    // S3b: per-built-in-tool permanent disable list rides the same upsert.
    it("accepts disabledBuiltinTools as array of tool names", async () => {
      const upserted = { id: "pref-1", disabledBuiltinTools: ["record_transaction", "get_metrics"] };
      mockReturning.mockResolvedValue([upserted]);

      const req = new Request("http://localhost:3000/api/user-preferences", {
        method: "PATCH",
        body: JSON.stringify({ disabledBuiltinTools: ["record_transaction", "get_metrics"] }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await PATCH(req);
      const body = await res.json();

      expect(body.disabledBuiltinTools).toEqual(["record_transaction", "get_metrics"]);
      const conflictArg = mockOnConflict.mock.calls[0]![0];
      expect(conflictArg.set).toEqual({ disabledBuiltinTools: ["record_transaction", "get_metrics"] });
    });

    it("rejects a non-array disabledBuiltinTools", async () => {
      const req = new Request("http://localhost:3000/api/user-preferences", {
        method: "PATCH",
        body: JSON.stringify({ disabledBuiltinTools: "record_transaction" }),
        headers: { "Content-Type": "application/json" },
      });

      await expect(PATCH(req)).rejects.toThrow();
    });

    it("rejects a non-array disabledMcpConnections", async () => {
      const req = new Request("http://localhost:3000/api/user-preferences", {
        method: "PATCH",
        body: JSON.stringify({ disabledMcpConnections: "c1" }),
        headers: { "Content-Type": "application/json" },
      });

      await expect(PATCH(req)).rejects.toThrow();
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
