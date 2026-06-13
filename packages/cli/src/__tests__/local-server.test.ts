import { describe, expect, it, vi } from "vitest";
import { resolveServerEntry, startServer } from "../local/server";

describe("resolveServerEntry", () => {
  it("returns BURNLESS_SERVER_ENTRY when set", () => {
    expect(resolveServerEntry({ BURNLESS_SERVER_ENTRY: "/app/server.js" })).toBe("/app/server.js");
  });
  it("returns null when unset (artifact packaging is a later plan)", () => {
    expect(resolveServerEntry({})).toBeNull();
  });
});

describe("startServer", () => {
  it("spawns node with the entry and injects PORT + HOSTNAME", () => {
    const spawnFn = vi.fn(() => ({ on: vi.fn() }));
    startServer({
      entry: "/app/server.js",
      host: "127.0.0.1",
      port: 2876,
      env: { FOO: "bar" },
      spawnFn: spawnFn as never,
    });
    expect(spawnFn).toHaveBeenCalledWith(
      process.execPath,
      ["/app/server.js"],
      expect.objectContaining({
        stdio: "inherit",
        env: expect.objectContaining({ FOO: "bar", PORT: "2876", HOSTNAME: "127.0.0.1" }),
      }),
    );
  });
});
