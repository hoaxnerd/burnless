import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks (mirror currency-validation.test.ts) ────────────────────────

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const {
  mockSelect,
  mockFrom,
  mockWhere,
  mockLimit,
  mockUpdate,
  mockSet,
  mockReturning,
  mockHasFinancialData,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
  mockReturning: vi.fn(),
  mockHasFinancialData: vi.fn(),
}));

vi.mock("@/lib/api-helpers", async () => {
  const { NextResponse } = await import("next/server");
  const { ConfirmableError, serializeConfirmable } = await import(
    "@/lib/confirmable-error"
  );

  return {
    requireCompanyAccess: mockRequireCompanyAccess,
    requireRole: mockRequireRole,
    parseBody: async (
      req: Request,
      schema: { parse: (d: unknown) => unknown }
    ) => {
      try {
        const body = await req.json();
        return { data: schema.parse(body) };
      } catch (e) {
        const message = e instanceof Error ? e.message : "Invalid request body";
        return {
          error: NextResponse.json({ error: message }, { status: 400 }),
        };
      }
    },
    errorResponse: (msg: string, status: number) =>
      NextResponse.json({ error: msg }, { status }),
    withErrorHandler:
      (fn: (...args: unknown[]) => Promise<unknown>) =>
      async (...args: unknown[]) => {
        try {
          return await fn(...args);
        } catch (e) {
          if (e instanceof ConfirmableError) {
            return NextResponse.json(serializeConfirmable(e), { status: 409 });
          }
          throw e;
        }
      },
  };
});

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
  },
  companies: {
    id: "id",
    name: "name",
    currency: "currency",
    foundersOwnershipPercent: "founders_ownership_percent",
  },
  hasFinancialData: mockHasFinancialData,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

import { PATCH } from "../route";

function jsonRequest(url: string, body?: unknown): Request {
  return new Request(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("PATCH /api/company — foundersOwnershipPercent", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit, returning: mockReturning });
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });

    mockLimit.mockResolvedValue([{ id: "comp-1", name: "Test Co", currency: "USD" }]);

    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "editor",
    });
    mockRequireRole.mockReturnValue(null);
  });

  it("persists foundersOwnershipPercent as a String-coerced numeric value (200)", async () => {
    mockReturning.mockResolvedValue([
      { id: "comp-1", foundersOwnershipPercent: "80" },
    ]);

    const req = jsonRequest("http://localhost/api/company", {
      foundersOwnershipPercent: 80,
    });
    const res = await PATCH(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.foundersOwnershipPercent).toBe("80");

    // The update payload must include foundersOwnershipPercent String-coerced
    // for the numeric() column (the exact bug class that 500'd a funding save).
    expect(mockSet).toHaveBeenCalledTimes(1);
    const payload = mockSet.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.foundersOwnershipPercent).toBe("80");
  });
});
