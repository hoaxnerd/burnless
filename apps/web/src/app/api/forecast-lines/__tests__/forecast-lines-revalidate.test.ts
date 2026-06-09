/**
 * Reflection guard: forecast-line mutations must revalidate the server-rendered
 * expense table + dashboard so an expense edit (incl. the category override)
 * reflects immediately. POST/PATCH/DELETE all call
 *   revalidateTag("expense-details") and revalidateTag("dashboard")
 * alongside the existing "forecast-lines" + "scenario-overrides" tags.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const { mockResolveEntities, mockScenarioInsert, mockScenarioUpdate, mockScenarioDelete } =
  vi.hoisted(() => ({
    mockResolveEntities: vi.fn(),
    mockScenarioInsert: vi.fn(),
    mockScenarioUpdate: vi.fn(),
    mockScenarioDelete: vi.fn(),
  }));

const { mockGetActiveScenario } = vi.hoisted(() => ({ mockGetActiveScenario: vi.fn() }));
const { mockRevalidateTag } = vi.hoisted(() => ({ mockRevalidateTag: vi.fn() }));

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
  db: { select: () => ({ from: () => ({ where: async () => [] }) }) },
  forecastLines: { companyId: "companyId", id: "id" },
  resolveEntities: mockResolveEntities,
  scenarioInsert: mockScenarioInsert,
  scenarioUpdate: mockScenarioUpdate,
  scenarioDelete: mockScenarioDelete,
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), lt: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: mockRevalidateTag }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/data-mutation-tracker", () => ({ trackDataMutation: vi.fn() }));
vi.mock("@/lib/scenario-middleware", () => ({ getActiveScenario: mockGetActiveScenario }));

import { POST } from "../route";
import { PATCH, DELETE } from "../[id]/route";

function jsonRequest(url: string, method: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

const CTX = { userId: "u1", companyId: "c1", role: "admin" };
const sampleLine = { id: "fl-1", companyId: "c1", accountId: "a1", method: "fixed" };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCompanyAccess.mockResolvedValue(CTX);
  mockRequireRole.mockReturnValue(null);
  mockGetActiveScenario.mockReturnValue(null);
});

describe("forecast-line mutations revalidate expense + dashboard tags", () => {
  it("POST revalidates expense-details + dashboard", async () => {
    mockScenarioInsert.mockResolvedValue(sampleLine);
    const res = await POST(
      jsonRequest("http://localhost/api/forecast-lines", "POST", {
        accountId: "a1",
        startDate: "2026-01-01",
      }),
    );
    expect(res.status).toBe(201);
    const tags = mockRevalidateTag.mock.calls.map((c) => c[0]);
    expect(tags).toContain("expense-details");
    expect(tags).toContain("dashboard");
    expect(tags).toContain("forecast-lines");
  });

  it("PATCH revalidates expense-details + dashboard", async () => {
    mockScenarioUpdate.mockResolvedValue(sampleLine);
    const res = await PATCH(
      jsonRequest("http://localhost/api/forecast-lines/fl-1", "PATCH", {
        subcategory: "Marketing",
      }),
      { params: Promise.resolve({ id: "fl-1" }) },
    );
    expect(res.status).toBe(200);
    const tags = mockRevalidateTag.mock.calls.map((c) => c[0]);
    expect(tags).toContain("expense-details");
    expect(tags).toContain("dashboard");
  });

  it("DELETE revalidates expense-details + dashboard", async () => {
    mockScenarioDelete.mockResolvedValue(true);
    const res = await DELETE(
      jsonRequest("http://localhost/api/forecast-lines/fl-1", "DELETE"),
      { params: Promise.resolve({ id: "fl-1" }) },
    );
    expect(res.status).toBe(200);
    const tags = mockRevalidateTag.mock.calls.map((c) => c[0]);
    expect(tags).toContain("expense-details");
    expect(tags).toContain("dashboard");
  });
});
