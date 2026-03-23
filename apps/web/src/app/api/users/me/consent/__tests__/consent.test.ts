import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockGetAuthUser } = vi.hoisted(() => ({
  mockGetAuthUser: vi.fn(),
}));

const {
  mockSelect,
  mockFrom,
  mockWhere,
  mockOrderBy,
  mockInsert,
  mockValues,
  mockUpdate,
  mockSet,
  mockTransaction,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockOrderBy: vi.fn(),
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  getAuthUser: mockGetAuthUser,
  errorResponse: (msg: string, status: number) =>
    NextResponse.json({ error: msg }, { status }),
  parseBody: async (
    req: Request,
    schema: { parse: (d: unknown) => unknown }
  ) => {
    try {
      const body = await req.json();
      return { data: schema.parse(body) };
    } catch {
      return {
        error: NextResponse.json(
          { error: "Validation failed" },
          { status: 400 }
        ),
      };
    }
  },
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    transaction: mockTransaction,
  },
  privacyConsents: {
    userId: "userId",
    purpose: "purpose",
    revokedAt: "revokedAt",
    grantedAt: "grantedAt",
    id: "id",
    granted: "granted",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
  desc: vi.fn(),
}));

import { GET, POST } from "../route";

function makeRequest(
  url: string,
  options?: RequestInit
): Request {
  return new Request(url, options);
}

describe("GET /api/users/me/consent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default chain: select().from().where().orderBy() → []
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockOrderBy.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuthUser.mockResolvedValue(null);

    const res = await GET(
      makeRequest("http://localhost/api/users/me/consent")
    );
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns all 4 consent purposes with defaults when no records exist", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });
    mockOrderBy.mockResolvedValue([]);

    const res = await GET(
      makeRequest("http://localhost/api/users/me/consent")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.consents).toHaveLength(4);
    expect(body.consents).toEqual([
      { purpose: "data_processing", granted: false, grantedAt: null },
      { purpose: "ai_features", granted: false, grantedAt: null },
      { purpose: "marketing", granted: false, grantedAt: null },
      { purpose: "analytics", granted: false, grantedAt: null },
    ]);
  });

  it("returns granted status from DB records", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });
    const now = new Date().toISOString();
    mockOrderBy.mockResolvedValue([
      { purpose: "data_processing", granted: true, grantedAt: now },
      { purpose: "analytics", granted: true, grantedAt: now },
    ]);

    const res = await GET(
      makeRequest("http://localhost/api/users/me/consent")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.consents).toHaveLength(4);
    expect(body.consents[0]).toEqual({
      purpose: "data_processing",
      granted: true,
      grantedAt: now,
    });
    expect(body.consents[1]).toEqual({
      purpose: "ai_features",
      granted: false,
      grantedAt: null,
    });
    expect(body.consents[2]).toEqual({
      purpose: "marketing",
      granted: false,
      grantedAt: null,
    });
    expect(body.consents[3]).toEqual({
      purpose: "analytics",
      granted: true,
      grantedAt: now,
    });
  });
});

describe("POST /api/users/me/consent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default transaction mock: execute the callback with a tx object
    mockTransaction.mockImplementation(async (cb: Function) => {
      const txSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });
      const txInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });
      const txUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });
      return cb({ select: txSelect, insert: txInsert, update: txUpdate });
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuthUser.mockResolvedValue(null);

    const res = await POST(
      makeRequest("http://localhost/api/users/me/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "analytics", granted: true }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 for invalid purpose", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });

    const res = await POST(
      makeRequest("http://localhost/api/users/me/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "invalid_purpose", granted: true }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("returns 400 for missing granted field", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });

    const res = await POST(
      makeRequest("http://localhost/api/users/me/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "analytics" }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("records consent with correct response shape", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });

    const res = await POST(
      makeRequest("http://localhost/api/users/me/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "ai_features", granted: true }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.purpose).toBe("ai_features");
    expect(body.granted).toBe(true);
    expect(body.recordedAt).toBeDefined();
    // recordedAt should be a valid ISO date string
    expect(new Date(body.recordedAt).toISOString()).toBe(body.recordedAt);
  });
});
