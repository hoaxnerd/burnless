// apps/web/src/app/api/automations/[id]/__tests__/route.test.ts
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
    withErrorHandler: (fn: (...args: unknown[]) => unknown) => fn,
  };
});

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
  beforeEach(() => { vi.clearAllMocks(); mockReq.mockResolvedValue({ userId: "u1", companyId: "c1", role: "editor" }); h.get.mockResolvedValue({ id: "j1", name: "J", schedule: "0 8 * * *", status: "active", timezone: "UTC" }); });

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

  it("DELETE 404s an unknown / cross-company job and does not soft-delete", async () => {
    h.get.mockResolvedValue(null);
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), params("nope"));
    expect(res.status).toBe(404);
    expect(h.del).not.toHaveBeenCalled();
  });

  it("PATCH/DELETE reject a viewer (403) — AUTHZ-01 write-role gate", async () => {
    mockReq.mockResolvedValue({ userId: "u1", companyId: "c1", role: "viewer" });
    const patchRes = await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ name: "x" }) }), params("j1"));
    expect(patchRes.status).toBe(403);
    const delRes = await DELETE(new Request("http://x", { method: "DELETE" }), params("j1"));
    expect(delRes.status).toBe(403);
    expect(h.update).not.toHaveBeenCalled();
    expect(h.del).not.toHaveBeenCalled();
  });

  // D3: PATCH uses the job's stored timezone when recomputing nextRunAt
  it("PATCH schedule change uses the job's stored timezone (Asia/Kolkata) for nextRunAt", async () => {
    h.get.mockResolvedValue({ id: "j1", schedule: "0 8 * * *", status: "active", timezone: "Asia/Kolkata" });
    await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ schedule: "0 9 * * *" }) }), params("j1"));
    const [, , patch] = h.update.mock.calls[0] as [unknown, unknown, { nextRunAt: Date }];
    // 09:00 Asia/Kolkata = 03:30 UTC → minutes must be 30
    expect(patch.nextRunAt).toBeInstanceOf(Date);
    expect(patch.nextRunAt.getUTCMinutes()).toBe(30);
  });

  it("PATCH re-enable uses the job's stored timezone (Asia/Kolkata) for nextRunAt", async () => {
    h.get.mockResolvedValue({ id: "j1", schedule: "0 9 * * *", status: "auto_disabled", timezone: "Asia/Kolkata" });
    await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ enabled: true }) }), params("j1"));
    const [, , patch] = h.update.mock.calls[0] as [unknown, unknown, { nextRunAt: Date }];
    expect(patch.nextRunAt).toBeInstanceOf(Date);
    expect(patch.nextRunAt.getUTCMinutes()).toBe(30);
  });
});
