import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  withErrorHandler: (fn: Function) => fn,
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
  dashboardPreferences: {
    id: "id",
    userId: "userId",
    companyId: "companyId",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock("@burnless/engine", () => ({
  DEFAULT_HERO_CARDS: ["cashRunway", "netBurnRate", "mrr", "cashPosition"],
  DEFAULT_SECONDARY_METRICS: ["grossMargin", "ltv", "cac"],
}));

import { GET, PATCH } from "../route";

describe("/api/dashboard-preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "u1",
      companyId: "c1",
      role: "owner",
    });

    // DB chain: select().from().where().limit()
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });

    // Insert chain: insert().values().returning()
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });

    // Update chain: update().set().where().returning()
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });
  });

  describe("GET", () => {
    it("returns saved preferences when they exist", async () => {
      const prefs = {
        mode: "custom",
        heroCards: ["mrr"],
        secondaryMetrics: ["grossMargin"],
        cardModeOverrides: {},
        cardScenarioOverrides: {},
        customMetrics: [],
      };
      mockLimit.mockResolvedValue([prefs]);

      const res = await GET();
      const body = await res.json();

      expect(body.mode).toBe("custom");
      expect(body.heroCards).toEqual(["mrr"]);
    });

    it("returns defaults when no preferences exist", async () => {
      mockLimit.mockResolvedValue([]);

      const res = await GET();
      const body = await res.json();

      expect(body.mode).toBe("dynamic");
      expect(body.heroCards).toEqual(["cashRunway", "netBurnRate", "mrr", "cashPosition"]);
      expect(body.secondaryMetrics).toEqual(["grossMargin", "ltv", "cac"]);
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
      mockLimit.mockResolvedValue([{ id: "pref-1" }]);
      const updated = { id: "pref-1", mode: "intelligence" };
      mockUpdateReturning.mockResolvedValue([updated]);

      const req = new Request("http://localhost:3000/api/dashboard-preferences", {
        method: "PATCH",
        body: JSON.stringify({ mode: "intelligence" }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await PATCH(req);
      const body = await res.json();

      expect(body.mode).toBe("intelligence");
    });

    it("creates new preferences when none exist", async () => {
      mockLimit.mockResolvedValue([]);
      const created = { id: "new-1", mode: "custom", heroCards: ["mrr"] };
      mockReturning.mockResolvedValue([created]);

      const req = new Request("http://localhost:3000/api/dashboard-preferences", {
        method: "PATCH",
        body: JSON.stringify({ mode: "custom", heroCards: ["mrr"] }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await PATCH(req);
      expect(res.status).toBe(201);
    });

    it("rejects invalid mode values", async () => {
      const req = new Request("http://localhost:3000/api/dashboard-preferences", {
        method: "PATCH",
        body: JSON.stringify({ mode: "invalid-mode" }),
        headers: { "Content-Type": "application/json" },
      });

      await expect(PATCH(req)).rejects.toThrow();
    });

    it("rejects heroCards exceeding max 8", async () => {
      const req = new Request("http://localhost:3000/api/dashboard-preferences", {
        method: "PATCH",
        body: JSON.stringify({ heroCards: Array(9).fill("card") }),
        headers: { "Content-Type": "application/json" },
      });

      await expect(PATCH(req)).rejects.toThrow();
    });
  });
});
