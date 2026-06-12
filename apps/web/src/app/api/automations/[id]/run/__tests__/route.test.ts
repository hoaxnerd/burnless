// apps/web/src/app/api/automations/[id]/run/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const { mockReq } = vi.hoisted(() => ({ mockReq: vi.fn().mockResolvedValue({ userId: "u1", companyId: "c1" }) }));
vi.mock("@/lib/api-helpers", () => ({ requireCompanyAccess: mockReq, withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn }));
const h = vi.hoisted(() => ({ get: vi.fn().mockResolvedValue({ id: "j1" }), run: vi.fn().mockResolvedValue({ run: { id: "r1" }, status: "success" }) }));
vi.mock("@burnless/db", () => ({ getScheduledJob: h.get }));
vi.mock("@/lib/automations/runner", () => ({ runScheduledJob: h.run }));
import { POST } from "../route";
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("POST /api/automations/[id]/run", () => {
  beforeEach(() => { vi.clearAllMocks(); h.get.mockResolvedValue({ id: "j1" }); });
  it("runs the saved job manually (commit)", async () => {
    const res = await POST(new Request("http://x", { method: "POST" }), params("j1"));
    expect(res.status).toBe(200);
    expect(h.run).toHaveBeenCalledWith("j1", "manual");
  });
  it("404s a job not in the company", async () => {
    h.get.mockResolvedValue(null);
    const res = await POST(new Request("http://x", { method: "POST" }), params("nope"));
    expect(res.status).toBe(404);
    expect(h.run).not.toHaveBeenCalled();
  });
});
