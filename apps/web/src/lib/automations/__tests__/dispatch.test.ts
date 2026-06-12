// apps/web/src/lib/automations/__tests__/dispatch.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  listDue: vi.fn(),
  run: vi.fn().mockResolvedValue({ run: { id: "r" }, result: null, status: "success" }),
  recordMissed: vi.fn().mockResolvedValue({}),
}));
vi.mock("@burnless/db", async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)();
  return { ...actual, listDueScheduledJobs: h.listDue, recordMissedRun: h.recordMissed };
});
vi.mock("../runner", () => ({ runScheduledJob: h.run }));

import { runDueScheduledJobs } from "../dispatch";

const at = (iso: string) => new Date(iso);

describe("runDueScheduledJobs", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("runs each due job once (trigger=schedule)", async () => {
    h.listDue.mockResolvedValue([
      { id: "j1", companyId: "c1", schedule: "* * * * *", nextRunAt: at("2026-06-12T00:00:00Z") },
      { id: "j2", companyId: "c1", schedule: "* * * * *", nextRunAt: at("2026-06-12T00:00:00Z") },
    ]);
    const out = await runDueScheduledJobs(at("2026-06-12T00:00:30Z"));
    expect(h.run).toHaveBeenCalledTimes(2);
    expect(h.run).toHaveBeenCalledWith("j1", "schedule");
    expect(out.ran).toBe(2);
  });

  it("records a missed row for a long-overdue job, then still runs it once", async () => {
    h.listDue.mockResolvedValue([{ id: "j1", companyId: "c1", schedule: "0 9 * * 1", nextRunAt: at("2020-01-01T00:00:00Z") }]);
    await runDueScheduledJobs(at("2026-06-12T00:00:00Z"));
    expect(h.recordMissed).toHaveBeenCalledWith("j1", "c1", expect.any(String));
    expect(h.run).toHaveBeenCalledWith("j1", "schedule");
  });

  it("isolates a throwing job — others still run", async () => {
    h.listDue.mockResolvedValue([
      { id: "boom", companyId: "c1", schedule: "* * * * *", nextRunAt: at("2026-06-12T00:00:00Z") },
      { id: "ok", companyId: "c1", schedule: "* * * * *", nextRunAt: at("2026-06-12T00:00:00Z") },
    ]);
    h.run.mockImplementation(async (id: string) => { if (id === "boom") throw new Error("x"); return { run: { id: "r" }, result: null, status: "success" }; });
    const out = await runDueScheduledJobs(at("2026-06-12T00:00:30Z"));
    expect(out.ran).toBe(2);
    expect(out.failed).toBe(1);
  });
});
