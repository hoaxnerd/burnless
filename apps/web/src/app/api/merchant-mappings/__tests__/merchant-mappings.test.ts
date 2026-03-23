import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockParseBody, mockErrorResponse } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockParseBody: vi.fn(),
  mockErrorResponse: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  parseBody: mockParseBody,
  errorResponse: mockErrorResponse,
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

const { mockExtractMerchantKey } = vi.hoisted(() => ({
  mockExtractMerchantKey: vi.fn(),
}));

vi.mock("@burnless/engine", () => ({
  extractMerchantKey: mockExtractMerchantKey,
}));

const {
  mockSelect, mockFrom, mockWhere, mockOrderBy, mockLimit,
  mockInsert, mockValues, mockReturning,
  mockUpdate, mockSet, mockUpdateWhere, mockUpdateReturning,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockOrderBy: vi.fn(),
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
  merchantCategoryMappings: {
    id: "id",
    companyId: "companyId",
    merchantPattern: "merchantPattern",
    updatedAt: "updatedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

import { GET, POST } from "../route";

describe("/api/merchant-mappings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCompanyAccess.mockResolvedValue({
      userId: "u1",
      companyId: "c1",
      role: "owner",
    });

    // Select chain: select().from().where().orderBy() or .limit()
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockImplementation(() => ({
      orderBy: mockOrderBy,
      limit: mockLimit,
    }));

    // Insert chain
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });

    // Update chain
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });
  });

  describe("GET", () => {
    it("returns all mappings for the company", async () => {
      const mappings = [
        { id: "m1", companyId: "c1", merchantPattern: "AMAZON", category: "operating_expense", subcategory: "Software" },
        { id: "m2", companyId: "c1", merchantPattern: "STRIPE", category: "cogs", subcategory: "Payment Processing" },
      ];
      mockOrderBy.mockResolvedValue(mappings);

      const req = new Request("http://localhost:3000/api/merchant-mappings");
      const res = await GET(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toHaveLength(2);
      expect(body[0].merchantPattern).toBe("AMAZON");
    });

    it("returns empty array when no mappings exist", async () => {
      mockOrderBy.mockResolvedValue([]);

      const req = new Request("http://localhost:3000/api/merchant-mappings");
      const res = await GET(req);
      const body = await res.json();

      expect(body).toEqual([]);
    });

    it("returns auth error when not authenticated", async () => {
      mockRequireCompanyAccess.mockResolvedValue({
        error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      });

      const req = new Request("http://localhost:3000/api/merchant-mappings");
      const res = await GET(req);
      expect(res.status).toBe(401);
    });
  });

  describe("POST", () => {
    it("creates a new mapping when pattern does not exist", async () => {
      const newMapping = { id: "m3", companyId: "c1", merchantPattern: "GOOGLE", category: "operating_expense", subcategory: "Cloud" };
      mockParseBody.mockResolvedValue({ data: { description: "GOOGLE CLOUD SERVICES", accountId: "acc-1", category: "operating_expense", subcategory: "Cloud" } });
      mockExtractMerchantKey.mockReturnValue("GOOGLE");
      mockLimit.mockResolvedValue([]); // no existing mapping
      mockReturning.mockResolvedValue([newMapping]);

      const req = new Request("http://localhost:3000/api/merchant-mappings", { method: "POST" });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.merchantPattern).toBe("GOOGLE");
    });

    it("updates existing mapping and increments override count", async () => {
      const existing = { id: "m1", companyId: "c1", merchantPattern: "AMAZON", overrideCount: 2 };
      const updated = { ...existing, category: "cogs", subcategory: "Infrastructure", overrideCount: 3 };

      mockParseBody.mockResolvedValue({ data: { description: "AMAZON WEB SERVICES", accountId: "acc-2", category: "cogs", subcategory: "Infrastructure" } });
      mockExtractMerchantKey.mockReturnValue("AMAZON");
      mockLimit.mockResolvedValue([existing]); // existing mapping found
      mockUpdateReturning.mockResolvedValue([updated]);

      const req = new Request("http://localhost:3000/api/merchant-mappings", { method: "POST" });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.overrideCount).toBe(3);
    });

    it("returns 400 when merchant key cannot be extracted", async () => {
      const errorResp = NextResponse.json({ error: "Could not extract merchant key from description" }, { status: 400 });
      mockParseBody.mockResolvedValue({ data: { description: "", accountId: "acc-1", category: "revenue", subcategory: "Sales" } });
      mockExtractMerchantKey.mockReturnValue(null);
      mockErrorResponse.mockReturnValue(errorResp);

      const req = new Request("http://localhost:3000/api/merchant-mappings", { method: "POST" });
      const res = await POST(req);

      expect(res.status).toBe(400);
    });

    it("returns auth error when not authenticated", async () => {
      mockRequireCompanyAccess.mockResolvedValue({
        error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      });

      const req = new Request("http://localhost:3000/api/merchant-mappings", { method: "POST" });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("returns parse error for invalid body", async () => {
      mockParseBody.mockResolvedValue({
        error: NextResponse.json({ error: "Validation failed" }, { status: 400 }),
      });

      const req = new Request("http://localhost:3000/api/merchant-mappings", { method: "POST" });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });
  });
});
