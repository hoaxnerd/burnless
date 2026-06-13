import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig, saveConfig } from "../config";
import { buildProgram } from "../index";

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "burnless-cli-program-"));
  process.env.BURNLESS_CONFIG_DIR = join(home, ".burnless");
  process.exitCode = undefined;
});
afterEach(() => {
  delete process.env.BURNLESS_CONFIG_DIR;
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

describe("profiles", () => {
  it("list shows the default marker", async () => {
    const { stdout } = await run("profiles", "list", "--json");
    const rows = JSON.parse(stdout) as Array<Record<string, unknown>>;
    expect(rows).toEqual([{ name: "local", baseUrl: "http://localhost:3000", auth: "pat", default: "*" }]);
  });

  it("use switches the default profile", async () => {
    const config = loadConfig();
    config.profiles.cloud = { baseUrl: "https://finance.acme.dev", authMode: "oauth" };
    saveConfig(config);
    await run("profiles", "use", "cloud");
    expect(loadConfig().defaultProfile).toBe("cloud");
    expect(process.exitCode === undefined || process.exitCode === 0).toBe(true);
  });

  it("use with an unknown profile exits 2", async () => {
    const { stderr } = await run("profiles", "use", "ghost");
    expect(process.exitCode).toBe(2);
    expect(stderr).toContain("Unknown profile");
  });
});

describe("whoami", () => {
  it("reports profile, baseUrl, and authMode", async () => {
    const { stdout } = await run("whoami", "--json");
    // credential/loggedIn are intentionally NOT asserted: on a dev machine the
    // OS keychain may hold a real burnless:local entry — asserting "none"
    // would couple the test to machine state.
    expect(JSON.parse(stdout)).toMatchObject({
      profile: "local",
      baseUrl: "http://localhost:3000",
      authMode: "pat",
    });
  });
});

describe("buildProgram", () => {
  it("registers the P1 local-instance verbs", () => {
    const program = buildProgram();
    const names = program.commands.map((c) => c.name());
    for (const v of ["start", "db", "health", "doctor", "bootstrap", "mcp", "completion"]) {
      expect(names).toContain(v);
    }
  });

  it("nests serve under mcp (not top-level)", () => {
    const program = buildProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).not.toContain("serve");
    const mcp = program.commands.find((c) => c.name() === "mcp");
    expect(mcp?.commands.map((c) => c.name())).toEqual(
      expect.arrayContaining(["serve", "add", "list"]),
    );
  });

  it("no longer registers the reserved admin stub", () => {
    const program = buildProgram();
    expect(program.commands.map((c) => c.name())).not.toContain("admin");
  });

  it("includes the banner tagline in help output", () => {
    const program = buildProgram();
    expect(program.helpInformation()).toContain("the founder platform");
  });

  it("registers the P2 verbs (users, config)", () => {
    const program = buildProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain("users");
    expect(names).toContain("config");
    const users = program.commands.find((c) => c.name() === "users");
    expect(users?.commands.map((c) => c.name())).toEqual(
      expect.arrayContaining(["list", "passwd", "create"]),
    );
    const config = program.commands.find((c) => c.name() === "config");
    expect(config?.commands.map((c) => c.name())).toEqual(
      expect.arrayContaining(["get", "set", "list", "unset"]),
    );
  });
});
