// apps/web/src/app/api/automations/dry-run/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const { mockReq } = vi.hoisted(() => ({ mockReq: vi.fn().mockResolvedValue({ userId: "u1", companyId: "c1" }) }));
vi.mock("@/lib/api-helpers", () => ({ requireCompanyAccess: mockReq, withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn }));
const h = vi.hoisted(() => ({ dry: vi.fn().mockResolvedValue({ response: "would set MRR $11,900 → $12,480", toolResults: [] }) }));
vi.mock("@/lib/automations/runner", () => ({ dryRunJobDraft: h.dry }));
import { POST } from "../route";
const body = (b: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(b) });

describe("POST /api/automations/dry-run", () => {
  beforeEach(() => vi.clearAllMocks());
  it("previews a draft (passes companyId/userId from session, never the client)", async () => {
    const res = await POST(body({ prompt: "do it", actionKind: "write", allowedTools: ["update_revenue_stream"], boundConnectionIds: [] }));
    expect(res.status).toBe(200);
    const [arg] = h.dry.mock.calls[0] as [{ companyId: string; createdByUserId: string }];
    expect(arg.companyId).toBe("c1");
    expect(arg.createdByUserId).toBe("u1");
    expect((await res.json()).response).toContain("12,480");
  });
});
