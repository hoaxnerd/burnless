// apps/web/src/lib/ai-tools/__tests__/audit-source.test.ts
import { describe, it, expect } from "vitest";
import type { ToolContext } from "../types";

describe("ToolContext scheduled-job audit fields", () => {
  it("accepts auditSource 'scheduled_job' and scheduledJobRunId (compile-time + shape)", () => {
    const ctx: ToolContext = {
      companyId: "c1",
      userId: "u1",
      auditSource: "scheduled_job",
      scheduledJobRunId: "run_1",
      mode: "commit",
    };
    expect(ctx.auditSource).toBe("scheduled_job");
    expect(ctx.scheduledJobRunId).toBe("run_1");
  });
});
