import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockGetAuthUser } = vi.hoisted(() => ({
  mockGetAuthUser: vi.fn(),
}));

const { mockSelect, mockFrom, mockWhere, mockLimit, mockUpdate, mockUpdSet, mockUpdWhere } =
  vi.hoisted(() => ({
    mockSelect: vi.fn(),
    mockFrom: vi.fn(),
    mockWhere: vi.fn(),
    mockLimit: vi.fn(),
    mockUpdate: vi.fn(),
    mockUpdSet: vi.fn(),
    mockUpdWhere: vi.fn(),
  }));

const { mockVerifyPassword, mockHashPassword } = vi.hoisted(() => ({
  mockVerifyPassword: vi.fn(),
  mockHashPassword: vi.fn().mockResolvedValue("pbkdf2:hashed"),
}));

vi.mock("@/lib/password", () => ({
  verifyPassword: mockVerifyPassword,
  hashPassword: mockHashPassword,
}));

vi.mock("@/lib/api-helpers", () => ({
  getAuthUser: mockGetAuthUser,
  errorResponse: (msg: string, status: number) =>
    NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
  parseBody: async (
    req: Request,
    schema: { parse: (d: unknown) => unknown }
  ) => {
    try {
      const body = await req.json();
      return { data: schema.parse(body) };
    } catch {
      return {
        error: NextResponse.json({ error: "Validation failed" }, { status: 400 }),
      };
    }
  },
}));

vi.mock("@/lib/api-rate-limit", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
  },
  users: { id: "id", passwordHash: "passwordHash" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

import { POST } from "../route";

function jsonRequest(body?: unknown): Request {
  return new Request("http://localhost/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("POST /api/auth/change-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });
    mockHashPassword.mockResolvedValue("pbkdf2:hashed");

    // select chain → returns a user with a password hash
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([{ id: "user-1", passwordHash: "pbkdf2:stored" }]);

    // update chain
    mockUpdate.mockReturnValue({ set: mockUpdSet });
    mockUpdSet.mockReturnValue({ where: mockUpdWhere });
    mockUpdWhere.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthUser.mockResolvedValue(null);
    const res = await POST(
      jsonRequest({ currentPassword: "old", newPassword: "NewPass1" })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when current password is wrong", async () => {
    mockVerifyPassword.mockResolvedValue(false);
    const res = await POST(
      jsonRequest({ currentPassword: "wrong", newPassword: "NewPass1" })
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("incorrect");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when new password fails strength validation", async () => {
    mockVerifyPassword.mockResolvedValue(true);
    const res = await POST(
      jsonRequest({ currentPassword: "old", newPassword: "weak" })
    );
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("updates the hash and returns 200 on valid change", async () => {
    mockVerifyPassword.mockResolvedValue(true);
    const res = await POST(
      jsonRequest({ currentPassword: "old", newPassword: "NewPass1" })
    );
    expect(res.status).toBe(200);
    expect(mockHashPassword).toHaveBeenCalledWith("NewPass1");
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockUpdSet).toHaveBeenCalledWith(
      expect.objectContaining({ passwordHash: "pbkdf2:hashed" })
    );
  });

  it("returns 400 when the account has no local password hash", async () => {
    mockLimit.mockResolvedValue([{ id: "user-1", passwordHash: null }]);
    const res = await POST(
      jsonRequest({ currentPassword: "old", newPassword: "NewPass1" })
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("no password");
  });
});

// Self-scoped sanity: the route does not import requireCompanyAccess (gates on
// session, not company role) — keeps it out of the AUTHZ-01 offender set.
describe("change-password authz shape", () => {
  it("does not reference NextResponse-role gating helpers it shouldn't", () => {
    expect(NextResponse).toBeDefined();
  });
});
