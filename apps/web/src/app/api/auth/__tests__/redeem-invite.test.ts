import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const {
  mockSelect,
  mockFrom,
  mockWhere,
  mockLimit,
  mockInsert,
  mockValues,
  mockUpdate,
  mockSet,
  mockTransaction,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    transaction: mockTransaction,
  },
  inviteCodes: {
    id: "id",
    code: "code",
    isActive: "isActive",
    expiresAt: "expiresAt",
    currentRedemptions: "currentRedemptions",
    maxRedemptions: "maxRedemptions",
    freePlatformDays: "freePlatformDays",
    aiCreditsCents: "aiCreditsCents",
  },
  inviteCodeRedemptions: {
    id: "id",
    inviteCodeId: "inviteCodeId",
    userId: "userId",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  sql: Object.assign((strings: TemplateStringsArray, ..._values: unknown[]) => strings.join("?"), {
    raw: (s: string) => s,
  }),
}));

vi.mock("@/lib/api-helpers", () => ({
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

vi.mock("@/lib/api-rate-limit", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

import { POST } from "../redeem-invite/route";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/redeem-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validInvite = {
  id: "inv-1",
  code: "ABC123",
  isActive: true,
  expiresAt: new Date(Date.now() + 86400000), // tomorrow
  currentRedemptions: 0,
  maxRedemptions: 100,
  freePlatformDays: 30,
  aiCreditsCents: 500,
};

describe("POST /api/auth/redeem-invite", () => {
  // Helper: create a tx mock where select().from().where().limit() returns the given values
  function setupTransaction(limitResults: unknown[][]) {
    let limitCall = 0;
    const txLimit = vi.fn().mockImplementation(() => limitResults[limitCall++] ?? []);
    const txWhere = vi.fn().mockReturnValue({ limit: txLimit });
    const txFrom = vi.fn().mockReturnValue({ where: txWhere });
    const txSelect = vi.fn().mockReturnValue({ from: txFrom });
    const txReturning = vi.fn().mockResolvedValue([{ id: "inv-1" }]);
    const txUpdateWhere = vi.fn().mockReturnValue({ returning: txReturning });
    const txSet = vi.fn().mockReturnValue({ where: txUpdateWhere });
    const txUpdate = vi.fn().mockReturnValue({ set: txSet });
    const txInsertValues = vi.fn().mockResolvedValue(undefined);
    const txInsert = vi.fn().mockReturnValue({ values: txInsertValues });

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = { select: txSelect, insert: txInsert, update: txUpdate };
      return fn(tx);
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redeems a valid invite code", async () => {
    setupTransaction([
      [validInvite],   // find invite
      [],              // no existing redemption
    ]);

    const res = await POST(jsonRequest({ code: "ABC123", userId: "user-1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.freePlatformDays).toBe(30);
    expect(body.aiCreditsCents).toBe(500);
    expect(mockTransaction).toHaveBeenCalled();
  });

  it("returns 400 for missing code", async () => {
    const res = await POST(jsonRequest({ userId: "user-1" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 for missing userId", async () => {
    const res = await POST(jsonRequest({ code: "ABC123" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("returns 404 for non-existent code", async () => {
    setupTransaction([[]]);

    const res = await POST(jsonRequest({ code: "INVALID", userId: "user-1" }));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Invalid invite code");
  });

  it("returns 410 for inactive code", async () => {
    setupTransaction([[{ ...validInvite, isActive: false }]]);

    const res = await POST(jsonRequest({ code: "ABC123", userId: "user-1" }));
    const body = await res.json();

    expect(res.status).toBe(410);
    expect(body.error).toBe("This invite code has been deactivated");
  });

  it("returns 410 for expired code", async () => {
    setupTransaction([[{
      ...validInvite,
      expiresAt: new Date(Date.now() - 86400000),
    }]]);

    const res = await POST(jsonRequest({ code: "ABC123", userId: "user-1" }));
    const body = await res.json();

    expect(res.status).toBe(410);
    expect(body.error).toBe("This invite code has expired");
  });

  it("returns 410 when max redemptions reached", async () => {
    setupTransaction([[{
      ...validInvite,
      currentRedemptions: 100,
      maxRedemptions: 100,
    }]]);

    const res = await POST(jsonRequest({ code: "ABC123", userId: "user-1" }));
    const body = await res.json();

    expect(res.status).toBe(410);
    expect(body.error).toBe("This invite code has reached its maximum redemptions");
  });

  it("returns 409 when user already redeemed", async () => {
    setupTransaction([
      [validInvite],
      [{ id: "redemption-1" }],
    ]);

    const res = await POST(jsonRequest({ code: "ABC123", userId: "user-1" }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("You have already redeemed this invite code");
  });

  it("handles invite with no expiration", async () => {
    setupTransaction([
      [{ ...validInvite, expiresAt: null }],
      [],
    ]);

    const res = await POST(jsonRequest({ code: "ABC123", userId: "user-1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
