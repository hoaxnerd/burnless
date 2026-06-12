import { describe, it, expect, vi, beforeEach } from "vitest";
const { mockReq } = vi.hoisted(() => ({ mockReq: vi.fn().mockResolvedValue({ userId: "u1", companyId: "c1" }) }));
vi.mock("@/lib/api-helpers", () => ({ requireCompanyAccess: mockReq, withErrorHandler: (fn: unknown) => fn }));
const h = vi.hoisted(() => ({ run: vi.fn().mockResolvedValue({ response: "did it", toolResults: [] }) }));
vi.mock("@/lib/automations/runner", () => ({ runJobDraftForReal: h.run }));
import { POST } from "../route";
const body = (b: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(b) });

describe("POST /api/automations/run-draft", () => {
  beforeEach(() => vi.clearAllMocks());
  it("runs the draft for real with session identity (not body)", async () => {
    const res = await POST(body({ prompt: "p", actionKind: "write", allowedTools: ["update_revenue_stream"], boundConnectionIds: [], companyId: "EVIL", createdByUserId: "EVIL" }));
    expect(res.status).toBe(200);
    const arg = h.run.mock.calls[0]![0];
    expect(arg.companyId).toBe("c1");
    expect(arg.createdByUserId).toBe("u1");
  });
});
