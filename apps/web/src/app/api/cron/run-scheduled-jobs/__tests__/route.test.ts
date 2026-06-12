// apps/web/src/app/api/cron/run-scheduled-jobs/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRunDueJobs } = vi.hoisted(() => ({
  mockRunDueJobs: vi.fn().mockResolvedValue({ ran: 1, results: [{ id: "x", ok: true }] }),
}));
vi.mock("@/lib/scheduler/core", () => ({ runDueJobs: mockRunDueJobs }));
// withErrorHandler transitively imports next-auth, which fails to resolve under
// happy-dom; stub it as a pass-through (same as the sibling cron route tests).
vi.mock("@/lib/api-helpers", () => ({
  withErrorHandler: (handler: (...args: unknown[]) => unknown) => handler,
}));

import { GET } from "../route";

describe("GET /api/cron/run-scheduled-jobs", () => {
  beforeEach(() => { process.env.CRON_SECRET = "s3cr3t"; delete process.env.DISABLE_CRON_AUTH; mockRunDueJobs.mockClear(); });

  it("401s without the bearer secret", async () => {
    const res = await GET(new Request("http://x/api/cron/run-scheduled-jobs"));
    expect(res.status).toBe(401);
    expect(mockRunDueJobs).not.toHaveBeenCalled();
  });
  it("runs the core with the secret and returns the outcome", async () => {
    const res = await GET(new Request("http://x/api/cron/run-scheduled-jobs", { headers: { authorization: "Bearer s3cr3t" } }));
    expect(res.status).toBe(200);
    expect(mockRunDueJobs).toHaveBeenCalledOnce();
    expect((await res.json()).ran).toBe(1);
  });
});
