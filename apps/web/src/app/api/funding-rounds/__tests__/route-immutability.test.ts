/**
 * Tests for roundType immutability guard in PATCH /api/funding-rounds/[id].
 * Phase 2 D §1.2, D2.
 *
 * The strip check fires BEFORE requireCompanyAccess so no session mock is needed.
 */
import { describe, it, expect, vi } from "vitest";
import { NextResponse } from "next/server";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const { mockScenarioUpdate, mockScenarioDelete } = vi.hoisted(() => ({
  mockScenarioUpdate: vi.fn(),
  mockScenarioDelete: vi.fn(),
}));

const { mockGetActiveScenario } = vi.hoisted(() => ({
  mockGetActiveScenario: vi.fn(),
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

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/data-mutation-tracker", () => ({ trackDataMutation: vi.fn() }));

vi.mock("@burnless/db", () => ({
  fundingRounds: { id: "id", companyId: "companyId" },
  scenarioUpdate: mockScenarioUpdate,
  scenarioDelete: mockScenarioDelete,
}));
vi.mock("@burnless/types", () => ({ updateFundingRoundSchema: { parse: (d: unknown) => d } }));
vi.mock("@/lib/scenario-middleware", () => ({ getActiveScenario: mockGetActiveScenario }));

// ── Import handler AFTER mocks ────────────────────────────────────────────────

import { PATCH } from "../[id]/route";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PATCH /api/funding-rounds/[id] roundType immutability", () => {
  it("returns 400 ROUND_TYPE_IMMUTABLE when body contains roundType", async () => {
    const req = new Request("http://localhost/api/funding-rounds/r1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roundType: "series_a", amount: 1000000 }),
    });
    const res = await PATCH(req as any, { params: Promise.resolve({ id: "r1" }) } as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("ROUND_TYPE_IMMUTABLE");
  });

  it("returns 400 when body contains alternate spelling 'type'", async () => {
    const req = new Request("http://localhost/api/funding-rounds/r1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "series_a", amount: 1000000 }),
    });
    const res = await PATCH(req as any, { params: Promise.resolve({ id: "r1" }) } as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("ROUND_TYPE_IMMUTABLE");
  });
});
