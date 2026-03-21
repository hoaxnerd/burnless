import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDelete, mockWhere, mockTransaction } = vi.hoisted(() => ({
  mockDelete: vi.fn(),
  mockWhere: vi.fn(),
  mockTransaction: vi.fn(),
}));

const mockGetAuthUser = vi.hoisted(() => vi.fn());

vi.mock("@burnless/db", () => ({
  db: {
    delete: mockDelete,
    transaction: mockTransaction,
  },
  users: { id: "id" },
  companies: { ownerId: "owner_id" },
  sessions: {},
  accounts: {},
  eq: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  getAuthUser: mockGetAuthUser,
  errorResponse: (message: string, status: number) => {
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  },
  withErrorHandler: <T extends Function>(handler: T) => handler,
}));

import { DELETE } from "../me/route";

function deleteRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/users/me", {
    method: "DELETE",
    headers,
  });
}

describe("DELETE /api/users/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDelete.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue(undefined);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuthUser.mockResolvedValue(null);

    const res = await DELETE(deleteRequest());
    expect(res.status).toBe(401);
  });

  it("returns 400 without confirmation header", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });

    const res = await DELETE(deleteRequest());
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("x-confirm-delete");
  });

  it("returns 400 with wrong confirmation header value", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });

    const res = await DELETE(
      deleteRequest({ "x-confirm-delete": "wrong-value" })
    );
    expect(res.status).toBe(400);
  });

  it("deletes user data in transaction with correct confirmation", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });
    mockTransaction.mockImplementation(async (fn: (...args: unknown[]) => unknown) => {
      const tx = {
        delete: mockDelete,
      };
      mockDelete.mockReturnValue({ where: mockWhere });
      mockWhere.mockResolvedValue(undefined);
      return fn(tx);
    });

    const res = await DELETE(
      deleteRequest({
        "x-confirm-delete": "permanently-delete-all-my-data",
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockTransaction).toHaveBeenCalledOnce();
    // Should call delete twice: once for companies, once for users
    expect(mockDelete).toHaveBeenCalledTimes(2);
  });

  it("returns 500 on transaction failure", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });
    mockTransaction.mockRejectedValue(new Error("DB error"));

    const res = await DELETE(
      deleteRequest({
        "x-confirm-delete": "permanently-delete-all-my-data",
      })
    );

    expect(res.status).toBe(500);
  });
});
