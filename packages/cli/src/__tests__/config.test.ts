import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  configPath,
  getProfile,
  loadConfig,
  resolveProfileName,
  saveConfig,
  type Profile,
} from "../config";
import { UsageError } from "../errors";

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "burnless-cli-config-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("config store", () => {
  it("first run yields the local profile pointing at http://localhost:3000", () => {
    const config = loadConfig(home);
    expect(config.defaultProfile).toBe("local");
    expect(config.profiles.local).toEqual({ baseUrl: "http://localhost:3000", authMode: "pat" });
  });

  it("round-trips save → load", () => {
    const config = loadConfig(home);
    config.profiles.cloud = { baseUrl: "https://finance.acme.dev", authMode: "oauth", defaultCompany: "acme" };
    config.defaultProfile = "cloud";
    saveConfig(config, home);
    const reloaded = loadConfig(home);
    expect(reloaded.defaultProfile).toBe("cloud");
    expect(reloaded.profiles.cloud).toEqual({
      baseUrl: "https://finance.acme.dev",
      authMode: "oauth",
      defaultCompany: "acme",
    });
  });

  it("NEVER writes secrets to disk — unknown keys are stripped (spec §7.2)", () => {
    const dirty = structuredClone(DEFAULT_CONFIG);
    dirty.profiles.local = {
      baseUrl: "http://localhost:3000",
      authMode: "pat",
      token: "bl_pat_LEAKED_SECRET",
      accessToken: "bl_at_ALSO_LEAKED",
    } as unknown as Profile;
    saveConfig(dirty, home);
    const written = readFileSync(configPath(home), "utf8");
    expect(written).not.toContain("bl_pat_LEAKED_SECRET");
    expect(written).not.toContain("bl_at_ALSO_LEAKED");
    expect(written).not.toContain("token");
  });

  it("resolveProfileName precedence: flag > BURNLESS_PROFILE > defaultProfile", () => {
    const config = { defaultProfile: "local", profiles: {} };
    expect(resolveProfileName(config, "flagged", { BURNLESS_PROFILE: "from-env" })).toBe("flagged");
    expect(resolveProfileName(config, undefined, { BURNLESS_PROFILE: "from-env" })).toBe("from-env");
    expect(resolveProfileName(config, undefined, {})).toBe("local");
  });

  it("getProfile throws UsageError (exit 2) for an unknown profile", () => {
    expect(() => getProfile(loadConfig(home), "nope")).toThrow(UsageError);
  });

  it("loadConfig throws UsageError for a profile missing baseUrl", () => {
    const bad = { defaultProfile: "bad", profiles: { bad: { authMode: "pat" } } };
    mkdirSync(join(home, ".burnless"), { recursive: true });
    writeFileSync(join(home, ".burnless", "config.json"), JSON.stringify(bad));
    expect(() => loadConfig(home)).toThrow(UsageError);
  });

  it("loadConfig throws UsageError for a profile with invalid authMode", () => {
    const bad = { defaultProfile: "bad", profiles: { bad: { baseUrl: "http://localhost:3000", authMode: "invalid" } } };
    mkdirSync(join(home, ".burnless"), { recursive: true });
    writeFileSync(join(home, ".burnless", "config.json"), JSON.stringify(bad));
    expect(() => loadConfig(home)).toThrow(UsageError);
  });
});
