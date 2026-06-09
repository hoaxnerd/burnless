/**
 * Tests for PATCH /api/option-pools/[id] and DELETE /api/option-pools/[id].
 * Cap-table structure is base-data-only (NOT scenario-editable): a write with an
 * active scenario returns 409. PATCH requires editor; DELETE requires admin.
 * DELETE is SOFT (softDeleteOptionPool, never a hard delete). totalReserved is
 * numeric(18,0) — STRING-coerced at the DB boundary. Every write revalidates
 * the "cap-table" tag (Phase 2 D cache contract).
 * Mirrors share-classes-id.test.ts vi.hoisted mocks.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const { mockUpdateOptionPool, mockSoftDeleteOptionPool } = vi.hoisted(() => ({
  mockUpdateOptionPool: vi.fn(),
  mockSoftDeleteOptionPool: vi.fn(),
}));

const { mockGetActiveScenario } = vi.hoisted(() => ({
  mockGetActiveScenario: vi.fn(),
}));

const { mockRevalidateTag, mockLogAudit, mockTrackDataMutation } = vi.hoisted(() => ({
  mockRevalidateTag: vi.fn(),
  mockLogAudit: vi.fn(),
  mockTrackDataMutation: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyAccess: mockRequireCompanyAccess,
  requireRole: mockRequireRole,
  parseBody: async (req: Request, schema: { parse: (d: unknown) => unknown }) => {
    try { return { data: schema.parse(await req.json()) }; }
    catch { return { error: NextResponse.json({ error: "Validation failed" }, { status: 400 }) }; }
  },
  errorResponse: (msg: string, status: number) => NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@burnless/db", () => ({
  updateOptionPool: mockUpdateOptionPool,
  softDeleteOptionPool: mockSoftDeleteOptionPool,
}));

vi.mock("next/cache", () => ({ revalidateTag: mockRevalidateTag }));
vi.mock("@/lib/audit", () => ({ logAudit: mockLogAudit }));
vi.mock("@/lib/data-mutation-tracker", () => ({ trackDataMutation: mockTrackDataMutation }));
vi.mock("@/lib/scenario-middleware", () => ({ getActiveScenario: mockGetActiveScenario }));

import { PATCH, DELETE } from "../[id]/route";

function jsonRequest(url: string, method: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

function ctxParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "comp-1", role: "owner" });
  mockRequireRole.mockReturnValue(null);
  mockGetActiveScenario.mockReturnValue(null);
});

describe("PATCH /api/option-pools/[id]", () => {
  it("updates totalReserved (200) with STRING-coerced share count", async () => {
    const updated = { id: "op-1", name: "2024 Pool", totalReserved: "1500000" };
    mockUpdateOptionPool.mockResolvedValue(updated);

    const res = await PATCH(
      jsonRequest("http://localhost/api/option-pools/op-1", "PATCH", { totalReserved: 1_500_000 }),
      ctxParams("op-1"),
    );
    expect(res.status).toBe(200);

    // totalReserved is numeric(18,0) — STRING at the DB boundary
    expect(mockUpdateOptionPool).toHaveBeenCalledWith(
      "op-1",
      "comp-1",
      expect.objectContaining({ totalReserved: "1500000" }),
    );
    expect(mockRevalidateTag).toHaveBeenCalledWith("cap-table");
    expect(mockTrackDataMutation).toHaveBeenCalledWith("comp-1", "funding");
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.anything(),
      "option_pool",
      "op-1",
      "update",
      expect.anything(),
    );
  });

  it("returns 404 when the option pool does not exist", async () => {
    mockUpdateOptionPool.mockResolvedValue(null);
    const res = await PATCH(
      jsonRequest("http://localhost/api/option-pools/missing", "PATCH", { totalReserved: 1 }),
      ctxParams("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for viewer role", async () => {
    mockRequireRole.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await PATCH(
      jsonRequest("http://localhost/api/option-pools/op-1", "PATCH", { totalReserved: 1 }),
      ctxParams("op-1"),
    );
    expect(res.status).toBe(403);
    expect(mockUpdateOptionPool).not.toHaveBeenCalled();
  });

  it("returns 409 when a scenario is active (base-data-only)", async () => {
    mockGetActiveScenario.mockReturnValue("scn-1");
    const res = await PATCH(
      jsonRequest("http://localhost/api/option-pools/op-1", "PATCH", { totalReserved: 1 }),
      ctxParams("op-1"),
    );
    expect(res.status).toBe(409);
    expect(mockUpdateOptionPool).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/option-pools/[id]", () => {
  it("soft-deletes as admin (200) and returns { deleted: true }", async () => {
    mockRequireCompanyAccess.mockResolvedValue({ userId: "user-1", companyId: "comp-1", role: "admin" });
    mockSoftDeleteOptionPool.mockResolvedValue({ id: "op-1", deletedAt: new Date() });
    const res = await DELETE(
      jsonRequest("http://localhost/api/option-pools/op-1", "DELETE"),
      ctxParams("op-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ deleted: true });

    expect(mockSoftDeleteOptionPool).toHaveBeenCalledWith("op-1", "comp-1");
    expect(mockRevalidateTag).toHaveBeenCalledWith("cap-table");
    expect(mockTrackDataMutation).toHaveBeenCalledWith("comp-1", "funding");
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.anything(),
      "option_pool",
      "op-1",
      "delete",
      expect.anything(),
    );
  });

  it("returns 403 for editor role (DELETE requires admin)", async () => {
    mockRequireRole.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await DELETE(
      jsonRequest("http://localhost/api/option-pools/op-1", "DELETE"),
      ctxParams("op-1"),
    );
    expect(res.status).toBe(403);
    expect(mockSoftDeleteOptionPool).not.toHaveBeenCalled();
  });

  it("returns 404 when the option pool does not exist", async () => {
    mockSoftDeleteOptionPool.mockResolvedValue(null);
    const res = await DELETE(
      jsonRequest("http://localhost/api/option-pools/missing", "DELETE"),
      ctxParams("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when a scenario is active (base-data-only)", async () => {
    mockGetActiveScenario.mockReturnValue("scn-1");
    const res = await DELETE(
      jsonRequest("http://localhost/api/option-pools/op-1", "DELETE"),
      ctxParams("op-1"),
    );
    expect(res.status).toBe(409);
    expect(mockSoftDeleteOptionPool).not.toHaveBeenCalled();
  });
});
