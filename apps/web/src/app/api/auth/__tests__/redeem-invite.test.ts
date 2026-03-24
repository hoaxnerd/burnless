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
  sql: vi.fn(),
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
  beforeEach(() => {
    vi.clearAllMocks();

    // Default DB mock chain
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockInsert.mockReturnValue({ values: mockValues });
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
  });

  it("redeems a valid invite code", async () => {
    // First query: find the invite
    mockLimit.mockResolvedValueOnce([validInvite]);
    // Second query: check no existing redemption
    mockLimit.mockResolvedValueOnce([]);
    // Transaction
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        insert: mockInsert,
        update: mockUpdate,
      };
      await fn(tx);
    });
    mockValues.mockResolvedValue(undefined);

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
    mockLimit.mockResolvedValueOnce([]);

    const res = await POST(jsonRequest({ code: "INVALID", userId: "user-1" }));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Invalid invite code");
  });

  it("returns 410 for inactive code", async () => {
    mockLimit.mockResolvedValueOnce([{ ...validInvite, isActive: false }]);

    const res = await POST(jsonRequest({ code: "ABC123", userId: "user-1" }));
    const body = await res.json();

    expect(res.status).toBe(410);
    expect(body.error).toBe("This invite code has been deactivated");
  });

  it("returns 410 for expired code", async () => {
    mockLimit.mockResolvedValueOnce([{
      ...validInvite,
      expiresAt: new Date(Date.now() - 86400000), // yesterday
    }]);

    const res = await POST(jsonRequest({ code: "ABC123", userId: "user-1" }));
    const body = await res.json();

    expect(res.status).toBe(410);
    expect(body.error).toBe("This invite code has expired");
  });

  it("returns 410 when max redemptions reached", async () => {
    mockLimit.mockResolvedValueOnce([{
      ...validInvite,
      currentRedemptions: 100,
      maxRedemptions: 100,
    }]);

    const res = await POST(jsonRequest({ code: "ABC123", userId: "user-1" }));
    const body = await res.json();

    expect(res.status).toBe(410);
    expect(body.error).toBe("This invite code has reached its maximum redemptions");
  });

  it("returns 409 when user already redeemed", async () => {
    mockLimit.mockResolvedValueOnce([validInvite]);
    mockLimit.mockResolvedValueOnce([{ id: "redemption-1" }]);

    const res = await POST(jsonRequest({ code: "ABC123", userId: "user-1" }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("You have already redeemed this invite code");
  });

  it("handles invite with no expiration", async () => {
    mockLimit.mockResolvedValueOnce([{ ...validInvite, expiresAt: null }]);
    mockLimit.mockResolvedValueOnce([]);
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = { insert: mockInsert, update: mockUpdate };
      await fn(tx);
    });
    mockValues.mockResolvedValue(undefined);

    const res = await POST(jsonRequest({ code: "ABC123", userId: "user-1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
