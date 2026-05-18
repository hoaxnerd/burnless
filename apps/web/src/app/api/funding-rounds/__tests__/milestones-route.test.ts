import { describe, it, expect, vi } from "vitest";
import { NextResponse } from "next/server";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const { mockGetActiveScenario } = vi.hoisted(() => ({
  mockGetActiveScenario: vi.fn(),
}));

const { mockScenarioUpdate } = vi.hoisted(() => ({
  mockScenarioUpdate: vi.fn(),
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
vi.mock("@/lib/scenario-middleware", () => ({ getActiveScenario: mockGetActiveScenario }));

vi.mock("@burnless/db", () => ({
  db: { select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => []) })) })) },
  fundingRounds: {},
  scenarioUpdate: mockScenarioUpdate,
}));

// ── Import handler AFTER mocks ────────────────────────────────────────────────

import { PATCH } from "../[id]/milestones/[milestoneId]/route";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("/api/funding-rounds/[id]/milestones/[milestoneId]", () => {
  it("PATCH handler exports", () => {
    expect(typeof PATCH).toBe("function");
  });
});
