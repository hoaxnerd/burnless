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
  withErrorHandler: <T extends (...args: unknown[]) => unknown>(handler: T) =>
    handler,
}));

vi.mock("@/lib/logger", () => ({
  logger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { DELETE } from "../route";

function deleteRequest(headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/users/me", {
    method: "DELETE",
    headers: headers ?? {},
  });
}

describe("DELETE /api/users/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDelete.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthUser.mockResolvedValue(null);

    const res = await DELETE(deleteRequest());
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 400 when missing x-confirm-delete header", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });

    const res = await DELETE(deleteRequest());
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("x-confirm-delete");
  });

  it("returns 400 when x-confirm-delete header has wrong value", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });

    const res = await DELETE(
      deleteRequest({ "x-confirm-delete": "wrong-value" })
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("x-confirm-delete");
  });

  it("returns 200 on successful deletion with correct header", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });
    mockTransaction.mockImplementation(
      async (fn: (...args: unknown[]) => unknown) => {
        const tx = { delete: mockDelete };
        mockDelete.mockReturnValue({ where: mockWhere });
        mockWhere.mockResolvedValue(undefined);
        return fn(tx);
      }
    );

    const res = await DELETE(
      deleteRequest({
        "x-confirm-delete": "permanently-delete-all-my-data",
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe("All user data has been permanently deleted.");
    expect(mockTransaction).toHaveBeenCalledOnce();
    // Should call delete twice: once for companies, once for users
    expect(mockDelete).toHaveBeenCalledTimes(2);
  });

  it("returns 500 when transaction fails", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });
    mockTransaction.mockRejectedValue(new Error("DB error"));

    const res = await DELETE(
      deleteRequest({
        "x-confirm-delete": "permanently-delete-all-my-data",
      })
    );
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toContain("Failed to delete user data");
  });
});
