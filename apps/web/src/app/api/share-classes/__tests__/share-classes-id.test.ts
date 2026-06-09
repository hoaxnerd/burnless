/**
 * Tests for PATCH /api/share-classes/[id] and DELETE /api/share-classes/[id].
 * Cap-table structure is base-data-only (NOT scenario-editable): a write with an
 * active scenario returns 409. PATCH requires editor; DELETE requires admin.
 * DELETE is SOFT (softDeleteShareClass, never a hard delete).
 * Mirrors share-classes.test.ts vi.hoisted mocks.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireCompanyAccess, mockRequireRole } = vi.hoisted(() => ({
  mockRequireCompanyAccess: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));

const { mockUpdateShareClass, mockSoftDeleteShareClass } = vi.hoisted(() => ({
  mockUpdateShareClass: vi.fn(),
  mockSoftDeleteShareClass: vi.fn(),
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
  updateShareClass: mockUpdateShareClass,
  softDeleteShareClass: mockSoftDeleteShareClass,
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

describe("PATCH /api/share-classes/[id]", () => {
  it("updates totalIssued (200) with STRING-coerced share count", async () => {
    const updated = { id: "sc-1", name: "Common", classType: "common", totalIssued: "9000000" };
    mockUpdateShareClass.mockResolvedValue(updated);

    const res = await PATCH(
      jsonRequest("http://localhost/api/share-classes/sc-1", "PATCH", { totalIssued: 9_000_000 }),
      ctxParams("sc-1"),
    );
    expect(res.status).toBe(200);

    expect(mockUpdateShareClass).toHaveBeenCalledWith(
      "sc-1",
      "comp-1",
      expect.objectContaining({ totalIssued: "9000000" }),
    );
    expect(mockRevalidateTag).toHaveBeenCalledWith("cap-table");
    expect(mockTrackDataMutation).toHaveBeenCalledWith("comp-1", "funding");
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.anything(),
      "share_class",
      "sc-1",
      "update",
      expect.anything(),
    );
  });

  it("returns 404 when the share class does not exist", async () => {
    mockUpdateShareClass.mockResolvedValue(null);
    const res = await PATCH(
      jsonRequest("http://localhost/api/share-classes/missing", "PATCH", { totalIssued: 1 }),
      ctxParams("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for viewer role", async () => {
    mockRequireRole.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await PATCH(
      jsonRequest("http://localhost/api/share-classes/sc-1", "PATCH", { totalIssued: 1 }),
      ctxParams("sc-1"),
    );
    expect(res.status).toBe(403);
    expect(mockUpdateShareClass).not.toHaveBeenCalled();
  });

  it("returns 409 when a scenario is active (base-data-only)", async () => {
    mockGetActiveScenario.mockReturnValue("scn-1");
    const res = await PATCH(
      jsonRequest("http://localhost/api/share-classes/sc-1", "PATCH", { totalIssued: 1 }),
      ctxParams("sc-1"),
    );
    expect(res.status).toBe(409);
    expect(mockUpdateShareClass).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/share-classes/[id]", () => {
  it("soft-deletes as admin (200) and returns { deleted: true }", async () => {
    mockSoftDeleteShareClass.mockResolvedValue({ id: "sc-1", deletedAt: new Date() });
    const res = await DELETE(
      jsonRequest("http://localhost/api/share-classes/sc-1", "DELETE"),
      ctxParams("sc-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ deleted: true });

    expect(mockSoftDeleteShareClass).toHaveBeenCalledWith("sc-1", "comp-1");
    expect(mockRevalidateTag).toHaveBeenCalledWith("cap-table");
    expect(mockTrackDataMutation).toHaveBeenCalledWith("comp-1", "funding");
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.anything(),
      "share_class",
      "sc-1",
      "delete",
      expect.anything(),
    );
  });

  it("returns 403 for editor role (DELETE requires admin)", async () => {
    mockRequireRole.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await DELETE(
      jsonRequest("http://localhost/api/share-classes/sc-1", "DELETE"),
      ctxParams("sc-1"),
    );
    expect(res.status).toBe(403);
    expect(mockSoftDeleteShareClass).not.toHaveBeenCalled();
  });

  it("returns 404 when the share class does not exist", async () => {
    mockSoftDeleteShareClass.mockResolvedValue(null);
    const res = await DELETE(
      jsonRequest("http://localhost/api/share-classes/missing", "DELETE"),
      ctxParams("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when a scenario is active (base-data-only)", async () => {
    mockGetActiveScenario.mockReturnValue("scn-1");
    const res = await DELETE(
      jsonRequest("http://localhost/api/share-classes/sc-1", "DELETE"),
      ctxParams("sc-1"),
    );
    expect(res.status).toBe(409);
    expect(mockSoftDeleteShareClass).not.toHaveBeenCalled();
  });
});
