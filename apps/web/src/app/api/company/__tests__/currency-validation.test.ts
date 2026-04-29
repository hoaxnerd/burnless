import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

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

// ── @/lib/api-helpers — same shape as company.test.ts, but withErrorHandler
//    catches ConfirmableError so test 3 gets a real 409 response. ─────────────

vi.mock("@/lib/api-helpers", async () => {
  const { NextResponse } = await import("next/server");
  const { ConfirmableError, serializeConfirmable } = await import(
    "@/lib/confirmable-error"
  );

  return {
    requireCompanyAccess: mockRequireCompanyAccess,
    requireRole: mockRequireRole,
    // Mirrors real parseBody: passes Zod's error message through so test 1 can
    // assert the body mentions "currency".
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
    // withErrorHandler must catch ConfirmableError → 409 so test 3 works.
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

// ── @burnless/db — stub db chains + configurable hasFinancialData ─────────────

vi.mock("@burnless/db", () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
  },
  companies: {
    id: "id",
    name: "name",
    currency: "currency",
  },
  hasFinancialData: mockHasFinancialData,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

// ── Import handler AFTER mocks ────────────────────────────────────────────────

import { PATCH } from "../route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonRequest(url: string, body?: unknown): Request {
  return new Request(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PATCH /api/company — currency validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit, returning: mockReturning });
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });

    // Default: existing company with USD currency.
    mockLimit.mockResolvedValue([{ id: "comp-1", name: "Test Co", currency: "USD" }]);

    mockRequireCompanyAccess.mockResolvedValue({
      userId: "user-1",
      companyId: "comp-1",
      role: "admin",
    });
    mockRequireRole.mockReturnValue(null);
  });

  it("1. rejects a non-whitelist currency code with 400", async () => {
    const req = jsonRequest("http://localhost/api/company", { currency: "XYZ" });
    const res = await PATCH(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/currency/i);
  });

  it("2. accepts a whitelist currency when no financial data (200)", async () => {
    mockHasFinancialData.mockResolvedValue(false);
    mockReturning.mockResolvedValue([{ id: "comp-1", currency: "EUR" }]);

    const req = jsonRequest("http://localhost/api/company", { currency: "EUR" });
    const res = await PATCH(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.currency).toBe("EUR");
  });

  it("3. returns 409 requiresConfirmation when financial data exists and confirm missing", async () => {
    mockHasFinancialData.mockResolvedValue(true);

    const req = jsonRequest("http://localhost/api/company", { currency: "EUR" });
    const res = await PATCH(req);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toMatchObject({
      code: "CURRENCY_CHANGE_REQUIRES_CONFIRMATION",
      requiresConfirmation: true,
      details: { from: "USD", to: "EUR" },
    });
    expect(typeof body.error).toBe("string");
  });

  it("4. persists currency change when ?confirm=true and financial data exists", async () => {
    mockHasFinancialData.mockResolvedValue(true);
    mockReturning.mockResolvedValue([{ id: "comp-1", currency: "EUR" }]);

    const req = jsonRequest("http://localhost/api/company?confirm=true", { currency: "EUR" });
    const res = await PATCH(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.currency).toBe("EUR");
    // ConfirmableError was NOT thrown — confirmed by status 200.
    // Note: with confirmed=true the route short-circuits before calling
    // hasFinancialData, so we don't assert it was called.
  });

  it("5. does NOT fire confirm gate when currency is unchanged (other fields only)", async () => {
    mockReturning.mockResolvedValue([{ id: "comp-1", name: "Renamed", currency: "USD" }]);

    const req = jsonRequest("http://localhost/api/company", { name: "Renamed" });
    const res = await PATCH(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.name).toBe("Renamed");
    expect(mockHasFinancialData).not.toHaveBeenCalled();
  });
});
