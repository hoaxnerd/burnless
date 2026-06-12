// apps/web/src/lib/scheduler/__tests__/system-jobs.test.ts
import { describe, it, expect } from "vitest";
import { SYSTEM_JOBS } from "../system-jobs";

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
