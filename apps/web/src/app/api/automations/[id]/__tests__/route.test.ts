// apps/web/src/app/api/automations/[id]/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockReq } = vi.hoisted(() => ({ mockReq: vi.fn().mockResolvedValue({ userId: "u1", companyId: "c1" }) }));
vi.mock("@/lib/api-helpers", () => ({ requireCompanyAccess: mockReq, withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn }));

const h = vi.hoisted(() => ({
  get: vi.fn(), update: vi.fn().mockResolvedValue({ id: "j1" }), del: vi.fn().mockResolvedValue(undefined),
  runs: vi.fn().mockResolvedValue([{ id: "r1", status: "success" }]),
}));
vi.mock("@burnless/db", () => ({
  getScheduledJob: h.get, updateScheduledJob: h.update, softDeleteScheduledJob: h.del, listScheduledJobRuns: h.runs,
}));

import { GET, PATCH, DELETE } from "../route";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("/api/automations/[id]", () => {
  beforeEach(() => { vi.clearAllMocks(); mockReq.mockResolvedValue({ userId: "u1", companyId: "c1" }); h.get.mockResolvedValue({ id: "j1", name: "J", schedule: "0 8 * * *", status: "active" }); });

  it("GET returns the job + recent runs", async () => {
    const res = await GET(new Request("http://x"), params("j1"));
    const b = await res.json();
    expect(b.job.id).toBe("j1");
    expect(b.runs).toHaveLength(1);
  });

  it("GET 404s an unknown / cross-company job", async () => {
    h.get.mockResolvedValue(null);
    const res = await GET(new Request("http://x"), params("nope"));
    expect(res.status).toBe(404);
  });

  it("PATCH re-enabling a disabled job resets status + failures + recomputes nextRunAt", async () => {
    h.get.mockResolvedValue({ id: "j1", schedule: "0 8 * * *", status: "auto_disabled" });
    await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ enabled: true }) }), params("j1"));
    const [, , patch] = h.update.mock.calls[0] as [unknown, unknown, { enabled: boolean; status: string; consecutiveFailures: number; nextRunAt: Date }];
    expect(patch.enabled).toBe(true);
    expect(patch.status).toBe("active");
    expect(patch.consecutiveFailures).toBe(0);
    expect(patch.nextRunAt).toBeInstanceOf(Date);
  });

  it("PATCH changing the schedule recomputes nextRunAt; rejects an invalid cron", async () => {
    await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ schedule: "0 9 * * 1" }) }), params("j1"));
    const [, , schedPatch] = h.update.mock.calls[0] as [unknown, unknown, { nextRunAt: Date }];
    expect(schedPatch.nextRunAt).toBeInstanceOf(Date);
    const bad = await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ schedule: "garbage" }) }), params("j1"));
    expect(bad.status).toBe(400);
  });

  it("DELETE soft-deletes", async () => {
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), params("j1"));
    expect(res.status).toBe(200);
    expect(h.del).toHaveBeenCalledWith("j1", "c1");
  });
});
