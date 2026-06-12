import { describe, it, expect, vi, beforeEach } from "vitest";
const { mockReq } = vi.hoisted(() => ({ mockReq: vi.fn().mockResolvedValue({ userId: "u1", companyId: "c1", role: "editor" }) }));
// AUTHZ-01: faithful self-contained requireRole — editor+ passes, viewer 403s.
const ROLE_LEVEL: Record<string, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };
vi.mock("@/lib/api-helpers", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireCompanyAccess: mockReq,
    requireRole: (ctx: { role: string }, min: string) =>
      (ROLE_LEVEL[ctx.role] ?? -1) < (ROLE_LEVEL[min] ?? 99)
        ? NextResponse.json({ error: `Forbidden: requires ${min} role or higher` }, { status: 403 })
        : null,
    withErrorHandler: (fn: unknown) => fn,
  };
});
const h = vi.hoisted(() => ({ run: vi.fn().mockResolvedValue({ response: "did it", toolResults: [] }) }));
vi.mock("@/lib/automations/runner", () => ({ runJobDraftForReal: h.run }));
import { POST } from "../route";
const body = (b: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(b) });

describe("POST /api/automations/run-draft", () => {
  beforeEach(() => { vi.clearAllMocks(); mockReq.mockResolvedValue({ userId: "u1", companyId: "c1", role: "editor" }); });
  it("runs the draft for real with session identity (not body)", async () => {
    const res = await POST(body({ prompt: "p", actionKind: "write", allowedTools: ["update_revenue_stream"], boundConnectionIds: [], companyId: "EVIL", createdByUserId: "EVIL" }));
    expect(res.status).toBe(200);
    const arg = h.run.mock.calls[0]![0];
    expect(arg.companyId).toBe("c1");
    expect(arg.createdByUserId).toBe("u1");
  });
  it("rejects a viewer (403) — AUTHZ-01 write-role gate", async () => {
    mockReq.mockResolvedValue({ userId: "u1", companyId: "c1", role: "viewer" });
    const res = await POST(body({ prompt: "p", actionKind: "write", allowedTools: ["update_revenue_stream"], boundConnectionIds: [] }));
    expect(res.status).toBe(403);
    expect(h.run).not.toHaveBeenCalled();
  });
});
