/**
 * Tests for PATCH/DELETE /api/transactions/[id]:
 *   manual-only guard (403 for non-manual), scenario-active refusal (409),
 *   AUTHZ (404 cross-company), happy path. Fully mocks @burnless/db → unit project.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireWrite, mockRequireRole } = vi.hoisted(() => ({
  mockRequireWrite: vi.fn(),
  mockRequireRole: vi.fn().mockReturnValue(null),
}));
const { mockFindByIdForCompany, mockSelect, mockFrom, mockWhere } = vi.hoisted(() => ({
  mockFindByIdForCompany: vi.fn(),
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
}));
const { mockUpdate, mockSet, mockUpdWhere, mockReturning, mockDelete, mockDelWhere } = vi.hoisted(() => ({
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
  mockUpdWhere: vi.fn(),
  mockReturning: vi.fn(),
  mockDelete: vi.fn(),
  mockDelWhere: vi.fn(),
}));
const { mockGetActiveScenario } = vi.hoisted(() => ({ mockGetActiveScenario: vi.fn() }));

vi.mock("@/lib/api-helpers", () => ({
  requireCompanyWrite: mockRequireWrite,
  requireRole: mockRequireRole,
  parseBody: async (req: Request, schema: { parse: (d: unknown) => unknown }) => {
    try { return { data: schema.parse(await req.json()) }; }
    catch { return { error: NextResponse.json({ error: "Validation failed" }, { status: 400 }) }; }
  },
  errorResponse: (msg: string, status: number) => NextResponse.json({ error: msg }, { status }),
  withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock("@burnless/db", () => ({
  db: { select: mockSelect, update: mockUpdate, delete: mockDelete },
  transactions: { id: "id", companyId: "companyId" },
  financialAccounts: { id: "id", companyId: "companyId" },
  findByIdForCompany: mockFindByIdForCompany,
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/data-mutation-tracker", () => ({ trackDataMutation: vi.fn() }));
vi.mock("@/lib/scenario-middleware", () => ({ getActiveScenario: mockGetActiveScenario }));
// The [id] route imports updateTransactionSchema from ../schemas; mock it to passthrough.
vi.mock("../schemas", () => ({ updateTransactionSchema: { parse: (d: unknown) => d } }));

import { PATCH, DELETE } from "../[id]/route";

function req(url: string, options?: RequestInit) { return new Request(url, options); }
function params(id: string) { return { params: Promise.resolve({ id }) }; }

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireWrite.mockResolvedValue({ userId: "u1", companyId: "company-1", role: "editor" });
  mockRequireRole.mockReturnValue(null);
  mockGetActiveScenario.mockReturnValue(null);
  mockFindByIdForCompany.mockResolvedValue({ id: "txn-1", companyId: "company-1", accountId: "acc-1", source: "manual" });
  // AUTHZ-02 ownership select chain: db.select(...).from(...).where(...) → [{ id: "acc-1" }]
  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockWhere.mockResolvedValue([{ id: "acc-1" }]);
  // update chain: db.update(...).set(...).where(...).returning() → [row]
  mockUpdate.mockReturnValue({ set: mockSet });
  mockSet.mockReturnValue({ where: mockUpdWhere });
  mockUpdWhere.mockReturnValue({ returning: mockReturning });
  mockReturning.mockResolvedValue([{ id: "txn-1", description: "Updated" }]);
  // delete chain: db.delete(...).where(...) → resolves
  mockDelete.mockReturnValue({ where: mockDelWhere });
  mockDelWhere.mockResolvedValue(undefined);
});

describe("PATCH /api/transactions/[id]", () => {
  it("updates a manual transaction and returns 200", async () => {
    const res = await PATCH(
      req("http://localhost/api/transactions/txn-1", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Updated" }),
      }),
      params("txn-1"),
    );
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("returns 404 when the row is not the caller's company", async () => {
    mockFindByIdForCompany.mockResolvedValue(null);
    const res = await PATCH(
      req("http://localhost/api/transactions/nope", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "x" }),
      }),
      params("nope"),
    );
    expect(res.status).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-manual row (source=import)", async () => {
    mockFindByIdForCompany.mockResolvedValue({ id: "txn-1", companyId: "company-1", accountId: "acc-1", source: "import" });
    const res = await PATCH(
      req("http://localhost/api/transactions/txn-1", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "x" }),
      }),
      params("txn-1"),
    );
    expect(res.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 409 when a non-base scenario is active", async () => {
    mockGetActiveScenario.mockReturnValue("scenario-9");
    const res = await PATCH(
      req("http://localhost/api/transactions/txn-1", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "x" }),
      }),
      params("txn-1"),
    );
    expect(res.status).toBe(409);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 when the new accountId belongs to another company (AUTHZ-02)", async () => {
    mockWhere.mockResolvedValue([]); // ownership lookup finds nothing
    const res = await PATCH(
      req("http://localhost/api/transactions/txn-1", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: "foreign-acc" }),
      }),
      params("txn-1"),
    );
    expect(res.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/transactions/[id]", () => {
  it("deletes a manual transaction and returns 200", async () => {
    const res = await DELETE(req("http://localhost/api/transactions/txn-1", { method: "DELETE" }), params("txn-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
    expect(mockDelete).toHaveBeenCalled();
  });

  it("returns 403 for a non-manual row", async () => {
    mockFindByIdForCompany.mockResolvedValue({ id: "txn-1", companyId: "company-1", accountId: "acc-1", source: "forecast" });
    const res = await DELETE(req("http://localhost/api/transactions/txn-1", { method: "DELETE" }), params("txn-1"));
    expect(res.status).toBe(403);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("returns 409 when a non-base scenario is active", async () => {
    mockGetActiveScenario.mockReturnValue("scenario-9");
    const res = await DELETE(req("http://localhost/api/transactions/txn-1", { method: "DELETE" }), params("txn-1"));
    expect(res.status).toBe(409);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
