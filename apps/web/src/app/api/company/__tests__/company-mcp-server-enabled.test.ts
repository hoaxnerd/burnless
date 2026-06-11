/**
 * PATCH /api/company accepts mcpServerEnabled (B8 kill switch) — admin+
 * (route-level requireRole), boolean only, independent of other fields.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const { mockSelect, mockUpdate } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  requireRole: mockRequireRole,
  parseBody: async (req: Request, schema: { parse: (d: unknown) => unknown }) => {
    try {
      return { data: schema.parse(await req.json()) };
    } catch {
      return { error: NextResponse.json({ error: "Validation failed" }, { status: 400 }) };
    }
  },
  errorResponse: (msg: string, status: number) => NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@burnless/db", () => ({
  db: { select: mockSelect, update: mockUpdate },
  companies: { id: "id" },
  hasFinancialData: vi.fn().mockResolvedValue(false),
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn() }));

import { PATCH } from "../route";

function patchReq(body: unknown): Request {
  return new Request("http://localhost:3000/api/company", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockRequireCompanyAccess.mockResolvedValue({ userId: "u1", companyId: "c1", role: "admin" });
  mockSelect.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: async () => [{ id: "c1", currency: "USD", mcpServerEnabled: true }],
      }),
    }),
  });
  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: () => ({
        returning: async () => [{ id: "c1", mcpServerEnabled: false }],
      }),
    }),
  });
});

describe("PATCH /api/company mcpServerEnabled", () => {
  it("accepts a boolean and threads it into the update", async () => {
    const res = (await PATCH(patchReq({ mcpServerEnabled: false }))) as NextResponse;
    expect(res.status).toBe(200);
    const setArg = (mockUpdate.mock.results[0]!.value.set as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(setArg).toEqual({ mcpServerEnabled: false });
  });

  it("rejects non-boolean values", async () => {
    const res = (await PATCH(patchReq({ mcpServerEnabled: "off" }))) as NextResponse;
    expect(res.status).toBe(400);
  });
});
