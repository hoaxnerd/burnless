// apps/web/src/lib/automations/__tests__/runner-run.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  job: {
    id: "job1", companyId: "c1", createdByUserId: "u1", name: "Sync", prompt: "do it",
    actionKind: "write", allowedTools: ["update_revenue_stream"], boundConnectionIds: [],
    schedule: "0 9 * * 1", timezone: "UTC", enabled: true, status: "active",
    notifyPolicy: "smart", consecutiveFailures: 0, nextRunAt: new Date("2020-01-01T00:00:00Z"),
    lastRunCursor: null,
  },
  chat: vi.fn().mockResolvedValue({ response: "Updated MRR to $12,480.", toolResults: [{ tool: "update_revenue_stream", input: {}, result: "{}" }] }),
  startRun: vi.fn().mockResolvedValue({ id: "run1", status: "running" }),
  finishRun: vi.fn().mockResolvedValue({ id: "run1" }),
  updateJob: vi.fn().mockResolvedValue({}),
  notify: vi.fn().mockResolvedValue({}),
  aiCheck: vi.fn().mockResolvedValue({ allowed: true, writeMode: "full" }),
}));

vi.mock("@burnless/db", async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)();
  return {
    ...actual,
    getScheduledJobById: vi.fn().mockResolvedValue(h.job),
    startScheduledJobRun: h.startRun,
    finishScheduledJobRun: h.finishRun,
    updateScheduledJob: h.updateJob,
    createNotification: h.notify,
  };
});
vi.mock("@burnless/ai", async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)();
  return { ...actual, chat: h.chat, MUTATION_TOOL_NAMES: new Set(["update_revenue_stream"]),
    getFinancialTools: () => [{ name: "update_revenue_stream", description: "", inputSchema: { type: "object", properties: {} } }] };
});
vi.mock("@/lib/ai-feature-flags", () => ({ checkAiFeatureAllowed: h.aiCheck, getCompanyProviderConfig: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/ai-usage-tracker", () => ({ setTrackingCompanyId: vi.fn() }));
vi.mock("@/lib/data", () => ({ getDefaultScenario: vi.fn().mockResolvedValue({ id: "s1", name: "Base", source: "blank" }) }));
vi.mock("@/lib/build-ai-context", () => ({ buildAiContext: vi.fn().mockResolvedValue({ snapshot: {}, contextText: "CTX" }) }));
vi.mock("@/lib/ai-tools/mcp", () => ({ assembleMcpTools: vi.fn().mockResolvedValue({ tools: [], categories: {} }) }));
vi.mock("@/lib/ai-tools", () => ({ executeToolCall: vi.fn().mockResolvedValue("{}") }));

import { runScheduledJob } from "../runner";

describe("runScheduledJob", () => {
  beforeEach(() => { vi.clearAllMocks(); h.job.consecutiveFailures = 0; h.job.actionKind = "write"; h.aiCheck.mockResolvedValue({ allowed: true, writeMode: "full" }); h.chat.mockResolvedValue({ response: "Updated MRR.", toolResults: [{ tool: "update_revenue_stream", input: {}, result: "{}" }] }); });

  it("success: records success run, resets failures, recomputes nextRunAt, notifies", async () => {
    await runScheduledJob("job1", "schedule");
    expect(h.startRun).toHaveBeenCalledWith(expect.objectContaining({ scheduledJobId: "job1", trigger: "schedule" }));
    expect(h.finishRun).toHaveBeenCalledWith("run1", "c1", expect.objectContaining({ status: "success" }));
    const patch = h.updateJob.mock.calls[0]![2];
    expect(patch.consecutiveFailures).toBe(0);
    expect(patch.nextRunAt).toBeInstanceOf(Date);
  });

  it("write job under read_only write-mode: fails without calling chat", async () => {
    h.aiCheck.mockResolvedValue({ allowed: true, writeMode: "read_only" });
    await runScheduledJob("job1", "schedule");
    expect(h.chat).not.toHaveBeenCalled();
    expect(h.finishRun).toHaveBeenCalledWith("run1", "c1", expect.objectContaining({ status: "failed" }));
  });

  it("credits exhausted: fails without calling chat", async () => {
    h.aiCheck.mockResolvedValue({ allowed: false, reason: "credits exhausted" });
    await runScheduledJob("job1", "schedule");
    expect(h.chat).not.toHaveBeenCalled();
    expect(h.finishRun).toHaveBeenCalledWith("run1", "c1", expect.objectContaining({ status: "failed" }));
  });

  it("failure trips auto-disable at the threshold", async () => {
    h.job.consecutiveFailures = 2; // next failure = 3 = threshold
    h.chat.mockRejectedValue(new Error("boom"));
    await runScheduledJob("job1", "schedule");
    const patch = h.updateJob.mock.calls[0]![2];
    expect(patch.status).toBe("auto_disabled");
    expect(patch.enabled).toBe(false);
  });

  it("dry_run: does NOT mutate the job or notify; returns run+result", async () => {
    const out = await runScheduledJob("job1", "dry_run");
    expect(h.updateJob).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
    expect(out.run.id).toBe("run1");
    expect(out.result?.response).toContain("Updated MRR");
  });
});
