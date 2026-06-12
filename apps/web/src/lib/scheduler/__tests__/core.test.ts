// apps/web/src/lib/scheduler/__tests__/core.test.ts
import { describe, it, expect, vi } from "vitest";
import type { SystemJob } from "../types";

// core.ts imports SYSTEM_JOBS only as the default arg; every test injects its own
// jobs. Stub the registry so its transitive deps (cron libs -> next-auth, which
// fails to resolve under happy-dom) are not pulled into this pure-logic test.
vi.mock("../system-jobs", () => ({ SYSTEM_JOBS: [] }));

const { runDueJobs } = await import("../core");

const at = (iso: string) => new Date(iso);

describe("runDueJobs", () => {
  it("runs only jobs whose cron matches now", async () => {
    const ran: string[] = [];
    const jobs: SystemJob[] = [
      { id: "a", schedule: "0 3 * * *", run: async () => { ran.push("a"); return { ok: true }; } },
      { id: "b", schedule: "* * * * *", run: async () => { ran.push("b"); return { ok: true }; } },
    ];
    const out = await runDueJobs(at("2026-06-12T03:00:00Z"), jobs);
    expect(ran).toEqual(["a", "b"]); // both due at 03:00
    const out2 = await runDueJobs(at("2026-06-12T04:07:00Z"), jobs.slice(0, 1));
    expect(out2.ran).toBe(0); // "a" not due at 04:07
  });
  it("isolates a throwing job — others still run, result records the error", async () => {
    const jobs: SystemJob[] = [
      { id: "boom", schedule: "* * * * *", run: async () => { throw new Error("kaboom"); } },
      { id: "ok", schedule: "* * * * *", run: async () => ({ ok: true }) },
    ];
    const out = await runDueJobs(at("2026-06-12T03:00:00Z"), jobs);
    expect(out.ran).toBe(2);
    const boom = out.results.find((r) => r.id === "boom")!;
    expect(boom.ok).toBe(false);
    expect(boom.error).toContain("kaboom");
  });
});
