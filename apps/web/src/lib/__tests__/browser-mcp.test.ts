/**
 * Browser-use via Playwright MCP — recommended connection preset, availability
 * detection, and the self-host-only Chromium install helper (#33, S3a Plan 5 C6).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockListVisibleConnections } = vi.hoisted(() => ({
  mockListVisibleConnections: vi.fn(),
}));

vi.mock("@burnless/db", () => ({
  listVisibleConnections: mockListVisibleConnections,
}));

import {
  RECOMMENDED_PLAYWRIGHT_MCP,
  isBrowserUseAvailable,
  installBrowserEngine,
} from "../browser-mcp";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.BURNLESS_DEPLOYMENT;
});

describe("RECOMMENDED_PLAYWRIGHT_MCP preset", () => {
  it("is a stdio npx @playwright/mcp connection with authType none", () => {
    expect(RECOMMENDED_PLAYWRIGHT_MCP.transport).toBe("stdio");
    expect(RECOMMENDED_PLAYWRIGHT_MCP.command).toBe("npx");
    expect(RECOMMENDED_PLAYWRIGHT_MCP.args).toContain("@playwright/mcp@latest");
    expect(RECOMMENDED_PLAYWRIGHT_MCP.authType).toBe("none");
    expect(RECOMMENDED_PLAYWRIGHT_MCP.name).toBe("Playwright (browser control)");
    expect(RECOMMENDED_PLAYWRIGHT_MCP.slug.length).toBeGreaterThan(0);
  });
});

describe("isBrowserUseAvailable", () => {
  it("returns connected:false when no Playwright MCP connection exists", async () => {
    mockListVisibleConnections.mockResolvedValue([
      // an unrelated http connection
      { transport: "streamable_http", endpoint: "https://example.com/mcp", slug: "stripe", args: null },
    ]);
    const result = await isBrowserUseAvailable("company-1", "user-1");
    expect(result.connected).toBe(false);
    // chromiumInstalled is a best-effort probe; must be a boolean and must not throw
    expect(typeof result.chromiumInstalled).toBe("boolean");
  });

  it("returns connected:true when a matching Playwright MCP connection exists", async () => {
    mockListVisibleConnections.mockResolvedValue([
      {
        transport: "stdio",
        endpoint: "npx",
        slug: RECOMMENDED_PLAYWRIGHT_MCP.slug,
        args: ["@playwright/mcp@latest"],
      },
    ]);
    const result = await isBrowserUseAvailable("company-1", "user-1");
    expect(result.connected).toBe(true);
  });

  it("never throws if the connections query rejects", async () => {
    mockListVisibleConnections.mockRejectedValue(new Error("db down"));
    const result = await isBrowserUseAvailable("company-1", "user-1");
    expect(result.connected).toBe(false);
    expect(result.chromiumInstalled).toBe(false);
  });
});

describe("installBrowserEngine", () => {
  it("refuses (ok:false) when stdioMcp capability is off (cloud)", async () => {
    process.env.BURNLESS_DEPLOYMENT = "cloud";
    const spawn = vi.fn();
    const result = await installBrowserEngine({ spawn: spawn as never });
    expect(result.ok).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
    expect(result.log).toMatch(/self-host/i);
  });

  it("spawns npx playwright install chromium when self-host", async () => {
    delete process.env.BURNLESS_DEPLOYMENT; // default self_host
    const spawn = vi.fn((_cmd: string, _args: string[]) => ({
      stdout: { on: (_e: "data", _cb: (c: Buffer | string) => void) => {} },
      stderr: { on: (_e: "data", _cb: (c: Buffer | string) => void) => {} },
      on: (event: string, cb: (arg: number | Error | null) => void) => {
        if (event === "close") cb(0);
      },
    }));
    const result = await installBrowserEngine({ spawn: spawn as never });
    expect(spawn).toHaveBeenCalledTimes(1);
    const [cmd, args] = spawn.mock.calls[0]!;
    expect(cmd).toBe("npx");
    expect(args).toEqual(["playwright", "install", "chromium"]);
    expect(result.ok).toBe(true);
  });
});
