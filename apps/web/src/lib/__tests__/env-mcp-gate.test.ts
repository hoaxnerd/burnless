import { describe, it, expect, afterEach } from "vitest";

async function freshEnv() {
  // env.ts caches nothing per-getter for these, but re-import defensively
  const mod = await import("../env");
  return mod.env;
}

const saved = {
  dep: process.env.BURNLESS_DEPLOYMENT,
  stdio: process.env.BURNLESS_ALLOW_STDIO_MCP,
};

afterEach(() => {
  process.env.BURNLESS_DEPLOYMENT = saved.dep;
  process.env.BURNLESS_ALLOW_STDIO_MCP = saved.stdio;
});

describe("MCP deploy-mode gate (spec §3.6, D3)", () => {
  it("defaults to self_host with stdio allowed", async () => {
    delete process.env.BURNLESS_DEPLOYMENT;
    delete process.env.BURNLESS_ALLOW_STDIO_MCP;
    const env = await freshEnv();
    expect(env.deploymentMode).toBe("self_host");
    expect(env.allowStdioMcp).toBe(true);
  });

  it("cloud forces stdio off even if the flag says true", async () => {
    process.env.BURNLESS_DEPLOYMENT = "cloud";
    process.env.BURNLESS_ALLOW_STDIO_MCP = "true";
    const env = await freshEnv();
    expect(env.deploymentMode).toBe("cloud");
    expect(env.allowStdioMcp).toBe(false);
  });

  it("self-host operator can disable stdio", async () => {
    delete process.env.BURNLESS_DEPLOYMENT;
    process.env.BURNLESS_ALLOW_STDIO_MCP = "false";
    const env = await freshEnv();
    expect(env.allowStdioMcp).toBe(false);
  });
});
