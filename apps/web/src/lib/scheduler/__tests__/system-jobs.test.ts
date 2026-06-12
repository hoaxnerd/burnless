// apps/web/src/lib/scheduler/__tests__/system-jobs.test.ts
import { describe, it, expect, vi } from "vitest";
import { SYSTEM_JOBS } from "../system-jobs";

vi.mock("@/lib/data-retention", () => ({
  cleanupExpiredData: vi.fn().mockResolvedValue({ conversationsDeleted: 2, cacheDeleted: 5 }),
}));

describe("SYSTEM_JOBS registry", () => {
  it("has unique ids", () => {
    const ids = SYSTEM_JOBS.map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("every job has a 5-field cron schedule and a run fn", () => {
    for (const j of SYSTEM_JOBS) {
      expect(j.schedule.trim().split(/\s+/)).toHaveLength(5);
      expect(typeof j.run).toBe("function");
    }
  });
});

describe("data-retention system job", () => {
  it("is registered with the daily-03:00 schedule and calls cleanupExpiredData", async () => {
    const job = SYSTEM_JOBS.find((j) => j.id === "data-retention");
    expect(job).toBeDefined();
    expect(job!.schedule).toBe("0 3 * * *");
    const result = await job!.run();
    expect(result.ok).toBe(true);
    expect(result.summary).toContain("2");
  });
});
