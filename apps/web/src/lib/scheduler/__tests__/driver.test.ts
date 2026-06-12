// apps/web/src/lib/scheduler/__tests__/driver.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockRunDueJobs } = vi.hoisted(() => ({ mockRunDueJobs: vi.fn().mockResolvedValue({ ran: 0, results: [] }) }));
vi.mock("@/lib/scheduler/core", () => ({ runDueJobs: mockRunDueJobs }));

import { resolveSchedulerDriver, startInProcessScheduler, __resetSchedulerForTests } from "../driver";

describe("resolveSchedulerDriver", () => {
  beforeEach(() => { delete process.env.BURNLESS_SCHEDULER_DRIVER; delete process.env.BURNLESS_DEPLOYMENT; });
  it("defaults to in_process on self_host", () => {
    expect(resolveSchedulerDriver()).toBe("in_process");
  });
  it("defaults to external on cloud", () => {
    process.env.BURNLESS_DEPLOYMENT = "cloud";
    expect(resolveSchedulerDriver()).toBe("external");
  });
  it("honors the explicit override", () => {
    process.env.BURNLESS_DEPLOYMENT = "cloud";
    process.env.BURNLESS_SCHEDULER_DRIVER = "in_process";
    expect(resolveSchedulerDriver()).toBe("in_process");
  });
});

describe("startInProcessScheduler", () => {
  // Each test gets a pristine fake clock. We must clear the scheduler interval
  // (clearInterval) BEFORE tearing down the fake clock it was scheduled on, then
  // switch to real timers — otherwise a live interval survives into the next
  // test's fake clock and produces phantom ticks (notably failing the cloud
  // no-op assertion). Resetting the singleton inside the active fake clock is the
  // only ordering that fully flushes it.
  // NOTE: also clear BURNLESS_SCHEDULER_DRIVER — the resolveSchedulerDriver
  // "honors the explicit override" test above sets it to "in_process" and does
  // not clean up, which would otherwise force the in_process driver here and make
  // the cloud no-op assertion tick falsely.
  beforeEach(() => { vi.useFakeTimers(); __resetSchedulerForTests(); mockRunDueJobs.mockClear(); delete process.env.BURNLESS_DEPLOYMENT; delete process.env.BURNLESS_SCHEDULER_DRIVER; });
  afterEach(() => { __resetSchedulerForTests(); vi.useRealTimers(); });

  it("ticks runDueJobs on the interval when driver=in_process", () => {
    startInProcessScheduler();
    vi.advanceTimersByTime(60_000);
    expect(mockRunDueJobs).toHaveBeenCalledTimes(1);
  });
  it("is idempotent — a second call does not start a second timer", () => {
    startInProcessScheduler();
    startInProcessScheduler();
    vi.advanceTimersByTime(60_000);
    expect(mockRunDueJobs).toHaveBeenCalledTimes(1);
  });
  it("does nothing when driver=external (cloud)", () => {
    process.env.BURNLESS_DEPLOYMENT = "cloud";
    startInProcessScheduler();
    vi.advanceTimersByTime(120_000);
    expect(mockRunDueJobs).not.toHaveBeenCalled();
  });
  it("skips an overlapping tick while the previous runDueJobs is still in flight", () => {
    // First tick never resolves — a second timer fire must NOT start a concurrent run.
    mockRunDueJobs.mockReturnValueOnce(new Promise<never>(() => {}));
    startInProcessScheduler();
    vi.advanceTimersByTime(60_000);
    expect(mockRunDueJobs).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000); // second tick — guard should skip it
    expect(mockRunDueJobs).toHaveBeenCalledTimes(1);
  });
});
