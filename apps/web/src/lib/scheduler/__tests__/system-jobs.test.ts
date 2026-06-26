// apps/web/src/lib/scheduler/__tests__/system-jobs.test.ts
import { describe, it, expect, vi } from "vitest";
import { SYSTEM_JOBS } from "../system-jobs";

vi.mock("@/lib/data-retention", () => ({
  cleanupExpiredData: vi.fn().mockResolvedValue({ conversationsDeleted: 2, cacheDeleted: 5 }),
}));
// The registry now imports the extracted cron libs, whose transitive deps pull
// next-auth (unresolvable under happy-dom). Stub them — and give them resolved
// values so each job's run() resolves cleanly.
vi.mock("@/lib/cron/weekly-digest", () => ({
  runWeeklyDigest: vi.fn().mockResolvedValue({ generated: 0, total: 0, results: [] }),
}));
vi.mock("@/lib/cron/batch-regenerate", () => ({
  runBatchRegenerate: vi.fn().mockResolvedValue({ ok: true, processed: 0, results: [] }),
}));
// run-all-syncs pulls @burnless/db transitively; stub it so its run() resolves.
vi.mock("@/lib/integrations/run-all-syncs", () => ({
  runAllIntegrationSyncs: vi.fn().mockResolvedValue({ synced: 0, failed: 0 }),
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

describe("weekly-digest system job", () => {
  it("is registered with the Monday-08:00 schedule and its run() resolves ok", async () => {
    const job = SYSTEM_JOBS.find((j) => j.id === "weekly-digest");
    expect(job).toBeDefined();
    expect(job!.schedule).toBe("0 8 * * 1");
    const result = await job!.run();
    expect(result.ok).toBe(true);
  });
});

describe("batch-regenerate system job", () => {
  it("is registered with the every-5-minutes schedule and its run() resolves ok", async () => {
    const job = SYSTEM_JOBS.find((j) => j.id === "batch-regenerate");
    expect(job).toBeDefined();
    expect(job!.schedule).toBe("*/5 * * * *");
    const result = await job!.run();
    expect(result.ok).toBe(true);
  });
});

describe("integration-sync system job", () => {
  it("is registered with the hourly schedule and its run() resolves ok", async () => {
    const job = SYSTEM_JOBS.find((j) => j.id === "integration-sync");
    expect(job).toBeDefined();
    expect(job!.schedule).toBe("0 * * * *");
    const result = await job!.run();
    expect(result.ok).toBe(true);
    expect(result.summary).toContain("Synced");
  });
});
