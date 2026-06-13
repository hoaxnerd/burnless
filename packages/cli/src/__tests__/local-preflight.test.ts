import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { doctor, isPortFree } from "../local/preflight";

describe("isPortFree", () => {
  it("returns true for an unused high port", async () => {
    expect(await isPortFree(53999, "127.0.0.1")).toBe(true);
  });
  it("returns false when the port is occupied", async () => {
    const srv = createServer().listen(53998, "127.0.0.1");
    await new Promise((r) => srv.once("listening", r));
    try {
      expect(await isPortFree(53998, "127.0.0.1")).toBe(false);
    } finally {
      srv.close();
    }
  });
});

describe("doctor", () => {
  it("returns a list of named checks each with ok + detail", async () => {
    const checks = await doctor({ port: 53997, host: "127.0.0.1" });
    expect(Array.isArray(checks)).toBe(true);
    expect(checks.length).toBeGreaterThan(0);
    for (const c of checks) {
      expect(typeof c.name).toBe("string");
      expect(typeof c.ok).toBe("boolean");
      expect(typeof c.detail).toBe("string");
    }
    expect(checks.some((c) => c.name === "port")).toBe(true);
    expect(checks.some((c) => c.name === "node")).toBe(true);
  });
});
