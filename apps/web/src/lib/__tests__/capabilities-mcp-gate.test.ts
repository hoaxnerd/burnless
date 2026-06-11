import { describe, it, expect, afterEach } from "vitest";

describe("MCP stdio gate via capabilities", () => {
  const ORIG = process.env;
  afterEach(() => { process.env = ORIG; });
  it("self_host allows stdio", async () => {
    process.env = { ...ORIG }; delete process.env.BURNLESS_DEPLOYMENT;
    const { getCapabilities } = await import("../capabilities");
    expect(getCapabilities().stdioMcp).toBe(true);
  });
  it("cloud blocks stdio", async () => {
    process.env = { ...ORIG, BURNLESS_DEPLOYMENT: "cloud" };
    const { getCapabilities } = await import("../capabilities");
    expect(getCapabilities().stdioMcp).toBe(false);
  });
  it("self_host operator can opt out via override", async () => {
    process.env = { ...ORIG, BURNLESS_CAP_STDIO_MCP: "off" };
    const { getCapabilities } = await import("../capabilities");
    expect(getCapabilities().stdioMcp).toBe(false);
  });
});
