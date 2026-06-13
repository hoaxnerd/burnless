/**
 * End-to-end parse-path coverage for the `--profile` global. The pieces
 * (resolveProfileName / getProfile / assertLocalProfile) are unit-tested in
 * isolation; these tests drive the WHOLE commander program so a regression in
 * how `--profile` threads through runAction → buildContext is caught.
 *
 * Bug B: `--profile nonexistent provider list` used to silently fall back to the
 * default `local` profile (because the ai-config commands pass
 * `allowMissingProfile: true`) and run locally, instead of erroring "Unknown
 * profile". An explicitly-named unknown profile must throw; only the IMPLICIT
 * default profile may be missing on first run.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig, saveConfig } from "../config";
import { buildProgram } from "../index";

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "burnless-cli-profile-"));
  process.env.BURNLESS_CONFIG_DIR = join(home, ".burnless");
  process.exitCode = undefined;
  delete process.env.BURNLESS_PROFILE;
});
afterEach(() => {
  delete process.env.BURNLESS_CONFIG_DIR;
  delete process.env.BURNLESS_PROFILE;
  process.exitCode = undefined;
  rmSync(home, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function run(...argv: string[]): Promise<{ stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  await buildProgram().parseAsync(["node", "burnless", ...argv]);
  return { stdout, stderr };
}

describe("--profile end-to-end (provider list)", () => {
  it("an explicit unknown --profile errors 'Unknown profile' (does NOT run locally)", async () => {
    const { stderr } = await run("--profile", "nonexistent", "provider", "list");
    expect(process.exitCode).toBe(2);
    expect(stderr).toContain('Unknown profile "nonexistent"');
  });

  it("an explicit unknown --profile placed AFTER the verb also errors", async () => {
    const { stderr } = await run("provider", "list", "--profile", "nonexistent");
    expect(process.exitCode).toBe(2);
    expect(stderr).toContain('Unknown profile "nonexistent"');
  });

  it("an unknown BURNLESS_PROFILE env errors too", async () => {
    process.env.BURNLESS_PROFILE = "nonexistent";
    const { stderr } = await run("provider", "list");
    expect(process.exitCode).toBe(2);
    expect(stderr).toContain('Unknown profile "nonexistent"');
  });

  it("a VALID remote profile defers via assertLocalProfile (LOCAL-only message)", async () => {
    const config = loadConfig();
    config.profiles.cloud = { baseUrl: "https://app.burnless.example", authMode: "oauth" };
    saveConfig(config);
    const { stderr } = await run("--profile", "cloud", "provider", "list");
    expect(process.exitCode).toBe(2);
    expect(stderr).toContain("manages the LOCAL instance only");
  });
});
