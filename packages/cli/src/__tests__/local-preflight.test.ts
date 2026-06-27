import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { doctor, hasFatalFailure, isPortFree } from "../local/preflight";

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

  // Regression: `burnless update` execs the new version's `doctor --json` as its post-swap
  // gate. A running instance (the one being updated) still holds the port, so a busy port
  // MUST be reported but stay non-fatal — otherwise every in-place update rolls back.
  it("reports a busy port but marks it non-fatal (port + secrets_key)", async () => {
    const host = "127.0.0.1";
    const srv = createServer().listen(53996, host);
    await new Promise((r) => srv.once("listening", r));
    try {
      const checks = await doctor({ port: 53996, host });
      const port = checks.find((c) => c.name === "port")!;
      expect(port.ok).toBe(false); // truthful — `start` relies on this to refuse to bind
      expect(port.fatal).toBe(false); // …but never fatal for the health probe
      expect(checks.find((c) => c.name === "secrets_key")!.fatal).toBe(false);
    } finally {
      srv.close();
    }
  });
});

describe("hasFatalFailure (post-swap gate contract)", () => {
  it("ignores non-fatal failing checks (busy port, ungenerated key)", () => {
    expect(
      hasFatalFailure([
        { name: "node", ok: true, detail: "" },
        { name: "db_driver", ok: true, detail: "" },
        { name: "secrets_key", ok: false, detail: "", fatal: false },
        { name: "port", ok: false, detail: "", fatal: false },
      ]),
    ).toBe(false);
  });

  it("is fatal on a real failure (node / db driver)", () => {
    expect(hasFatalFailure([{ name: "db_driver", ok: false, detail: "boom" }])).toBe(true);
    expect(hasFatalFailure([{ name: "node", ok: false, detail: "old" }])).toBe(true);
  });
});
