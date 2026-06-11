import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const initDatabase = vi.fn(async () => ({}) as unknown);
vi.mock("@burnless/db", () => ({ initDatabase }));

describe("instrumentation register() — db init", () => {
  const prevRuntime = process.env.NEXT_RUNTIME;
  beforeEach(() => { initDatabase.mockClear(); });
  afterEach(() => {
    if (prevRuntime === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = prevRuntime;
  });

  it("calls initDatabase on the nodejs runtime", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const { register } = await import("../instrumentation");
    await register();
    expect(initDatabase).toHaveBeenCalledTimes(1);
  });

  it("does NOT call initDatabase on the edge runtime", async () => {
    process.env.NEXT_RUNTIME = "edge";
    vi.resetModules();
    const { register } = await import("../instrumentation");
    await register();
    expect(initDatabase).not.toHaveBeenCalled();
  });
});
