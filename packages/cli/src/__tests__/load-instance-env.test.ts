import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadInstanceEnv, setInstanceEnvVar } from "../local/home";

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(os.tmpdir(), "bl-loadenv-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  delete process.env.BURNLESS_PORT;
  delete process.env.AI_PROVIDER;
});

describe("loadInstanceEnv", () => {
  it("loads file vars into the target env", () => {
    setInstanceEnvVar("BURNLESS_PORT", "2876", home);
    setInstanceEnvVar("AI_PROVIDER", "openrouter", home);
    const env: NodeJS.ProcessEnv = {};
    loadInstanceEnv({ home, env });
    expect(env.BURNLESS_PORT).toBe("2876");
    expect(env.AI_PROVIDER).toBe("openrouter");
  });
  it("does NOT override an already-set env var (explicit env wins)", () => {
    setInstanceEnvVar("BURNLESS_PORT", "2876", home);
    const env: NodeJS.ProcessEnv = { BURNLESS_PORT: "9999" };
    loadInstanceEnv({ home, env });
    expect(env.BURNLESS_PORT).toBe("9999");
  });
  it("is a no-op when there is no instance.env", () => {
    const env: NodeJS.ProcessEnv = {};
    expect(() => loadInstanceEnv({ home, env })).not.toThrow();
    expect(Object.keys(env)).toHaveLength(0);
  });
});
