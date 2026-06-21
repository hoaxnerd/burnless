// apps/web/src/app/api/automations/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockReq } = vi.hoisted(() => ({ mockReq: vi.fn().mockResolvedValue({ userId: "u1", companyId: "c1", role: "editor" }) }));
// AUTHZ-01: a faithful (self-contained) requireRole — editor+ passes, viewer is rejected (403).
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
  list: vi.fn().mockResolvedValue([{ id: "j1", name: "J" }]),
  create: vi.fn().mockResolvedValue({ id: "new", name: "J" }),
  count: vi.fn().mockResolvedValue(0),
  aiCheck: vi.fn().mockResolvedValue({ allowed: true, writeMode: "full" }),
  getCompany: vi.fn().mockResolvedValue({ id: "c1", timezone: "America/New_York" }),
}));
vi.mock("@burnless/db", () => ({ listScheduledJobs: h.list, createScheduledJob: h.create, countScheduledJobs: h.count, getCompanyById: h.getCompany }));
vi.mock("@/lib/ai-feature-flags", () => ({ checkAiFeatureAllowed: h.aiCheck }));

import { GET, POST } from "../route";

const body = (b: unknown) => new Request("http://x/api/automations", { method: "POST", body: JSON.stringify(b) });
const validDraft = { name: "J", prompt: "do it", actionKind: "notify", allowedTools: ["list_accounts"], boundConnectionIds: [], schedule: "0 8 * * *" };

describe("/api/automations", () => {
  beforeEach(() => { vi.clearAllMocks(); mockReq.mockResolvedValue({ userId: "u1", companyId: "c1", role: "editor" }); h.count.mockResolvedValue(0); h.aiCheck.mockResolvedValue({ allowed: true, writeMode: "full" }); h.getCompany.mockResolvedValue({ id: "c1", timezone: "America/New_York" }); });

  it("GET lists the company's jobs", async () => {
    const res = await GET();
    expect((await res.json()).jobs).toHaveLength(1);
  });

  it("POST creates a job and computes nextRunAt", async () => {
    const res = await POST(body(validDraft));
    expect(res.status).toBe(200);
    const [arg] = h.create.mock.calls[0] as [{ nextRunAt: Date; companyId: string }];
    expect(arg.nextRunAt).toBeInstanceOf(Date);
    expect(arg.companyId).toBe("c1");
  });

  it("POST rejects a write job under read_only write-mode (409)", async () => {
    h.aiCheck.mockResolvedValue({ allowed: true, writeMode: "read_only" });
    const res = await POST(body({ ...validDraft, actionKind: "write" }));
    expect(res.status).toBe(409);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("POST rejects when the company is at the job cap (429/400)", async () => {
    process.env.BURNLESS_JOB_MAX_PER_COMPANY = "1";
    h.count.mockResolvedValue(1);
    const res = await POST(body(validDraft));
    expect([400, 429]).toContain(res.status);
    expect(h.create).not.toHaveBeenCalled();
    delete process.env.BURNLESS_JOB_MAX_PER_COMPANY;
  });

  it("POST rejects an invalid cron (400)", async () => {
    const res = await POST(body({ ...validDraft, schedule: "nonsense" }));
    expect(res.status).toBe(400);
  });

  it("POST rejects a viewer (403) — AUTHZ-01 write-role gate", async () => {
    mockReq.mockResolvedValue({ userId: "u1", companyId: "c1", role: "viewer" });
    const res = await POST(body(validDraft));
    expect(res.status).toBe(403);
    expect(h.create).not.toHaveBeenCalled();
  });

  // D3: timezone-aware scheduler
  it("POST: new job defaults timezone to company timezone (Asia/Kolkata) when not specified", async () => {
    h.getCompany.mockResolvedValue({ id: "c1", timezone: "Asia/Kolkata" });
    const res = await POST(body({ ...validDraft, schedule: "0 9 * * *" }));
    expect(res.status).toBe(200);
    const [arg] = h.create.mock.calls[0] as [{ timezone: string; nextRunAt: Date }];
    // (a) stored job timezone must match company timezone
    expect(arg.timezone).toBe("Asia/Kolkata");
    // (b) nextRunAt must be consistent with IST (offset +05:30):
    //     "0 9 * * *" → 09:00 IST = 03:30 UTC; so minutes of UTC must be 30
    expect(arg.nextRunAt).toBeInstanceOf(Date);
    expect(arg.nextRunAt.getUTCMinutes()).toBe(30); // 03:30Z → minutes=30 (IST offset is 5h30m)
  });

  it("POST: explicit client timezone overrides company timezone", async () => {
    h.getCompany.mockResolvedValue({ id: "c1", timezone: "Asia/Kolkata" });
    const res = await POST(body({ ...validDraft, schedule: "0 9 * * *", timezone: "UTC" }));
    expect(res.status).toBe(200);
    const [arg] = h.create.mock.calls[0] as [{ timezone: string; nextRunAt: Date }];
    expect(arg.timezone).toBe("UTC"); // explicit client tz wins
    // nextRunAt for "0 9 * * *" in UTC has minutes=0
    expect(arg.nextRunAt.getUTCMinutes()).toBe(0);
  });
});
