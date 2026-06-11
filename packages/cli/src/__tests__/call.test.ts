import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeToolCall, parseJsonObject } from "../commands/call";
import { buildToolInput, optionKeyOf } from "../commands/register-table";
import { COMMAND_TABLE, type ToolCommandEntry } from "../commands/table";
import type { CliContext } from "../context";
import { buildProgram } from "../index";
import { UsageError } from "../errors";
import { makeFakeSession } from "./helpers/fake-session";

function makeCtx(json: boolean): CliContext {
  return {
    config: { defaultProfile: "local", profiles: { local: { baseUrl: "http://localhost:3000", authMode: "pat" } } },
    profileName: "local",
    profile: { baseUrl: "http://localhost:3000", authMode: "pat" },
    keychain: {
      get: async () => null,
      set: async () => {},
      delete: async () => {},
    },
    json,
  };
}

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "burnless-cli-call-"));
  process.env.BURNLESS_CONFIG_DIR = join(home, ".burnless");
  process.exitCode = undefined;
});
afterEach(() => {
  delete process.env.BURNLESS_CONFIG_DIR;
  process.exitCode = undefined;
  rmSync(home, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("parseJsonObject", () => {
  it("parses a JSON object", () => {
    expect(parseJsonObject('{"a":1}')).toEqual({ a: 1 });
  });
  it("rejects non-objects and invalid JSON with exit 2", () => {
    expect(() => parseJsonObject("[1]")).toThrow(UsageError);
    expect(() => parseJsonObject("not json")).toThrow(UsageError);
  });
});

describe("optionKeyOf / buildToolInput", () => {
  it("camel-cases long flags the way commander does", () => {
    expect(optionKeyOf("--pre-money <amount>")).toBe("preMoney");
    expect(optionKeyOf("--projected")).toBe("projected");
  });

  it("maps args + typed flags onto tool input keys (funding create)", () => {
    const entry = COMMAND_TABLE.find(
      (e): e is ToolCommandEntry => e.kind === "tool" && e.tool === "create_funding_round"
    );
    expect(entry).toBeDefined();
    const input = buildToolInput(entry as ToolCommandEntry, ["Seed Round"], {
      type: "safe",
      amount: "500000",
      date: "2026-07-01",
      preMoney: "5000000",
      params: '{"valuationCap":6000000}',
      projected: true,
    });
    expect(input).toEqual({
      name: "Seed Round",
      roundType: "safe",
      amount: 500000,
      date: "2026-07-01",
      preMoneyValuation: 5000000,
      parameters: { valuationCap: 6000000 },
      isProjected: true,
    });
  });

  it("rejects a non-numeric value for a number flag with exit 2", () => {
    const entry = COMMAND_TABLE.find(
      (e): e is ToolCommandEntry => e.kind === "tool" && e.tool === "create_funding_round"
    ) as ToolCommandEntry;
    expect(() =>
      buildToolInput(entry, ["Seed"], { type: "safe", amount: "lots", date: "2026-07-01" })
    ).toThrow(UsageError);
  });
});

describe("executeToolCall", () => {
  it("activates the scenario in the SAME session before the main call (spec §7.5)", async () => {
    const { session, log } = makeFakeSession();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await executeToolCall(
      makeCtx(true),
      { tool: "get_metrics", input: { startDate: "2026-01" }, scenario: "scn_1" },
      async () => session
    );
    expect(log.toolCalls).toEqual([
      { name: "activate_scenario", input: { scenarioId: "scn_1" } },
      { name: "get_metrics", input: { startDate: "2026-01" } },
    ]);
    expect(log.closed).toBe(true);
  });

  it("--json writes the raw payload to stdout", async () => {
    const { session } = makeFakeSession();
    let stdout = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });
    await executeToolCall(makeCtx(true), { tool: "get_metrics", input: {} }, async () => session);
    expect(JSON.parse(stdout)).toEqual({ ok: true, tool: "get_metrics" });
  });

  it("a tool error surfaces as CliError exit 1 and still closes the session", async () => {
    const { session, log } = makeFakeSession({
      async callTool() {
        return { isError: true, text: "scenario not found" };
      },
    });
    await expect(
      executeToolCall(makeCtx(true), { tool: "get_metrics", input: {} }, async () => session)
    ).rejects.toMatchObject({ exitCode: 1 });
    expect(log.closed).toBe(true);
  });
});

describe("write gate wiring (through the real program)", () => {
  it("call on a delete_ tool without --yes in a non-TTY shell exits 2 before any network I/O", async () => {
    let stderr = "";
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });
    // vitest stdin is not a TTY; no session can be opened (no credentials) —
    // the gate must fire FIRST, so this exits 2 with the refusal message.
    await buildProgram().parseAsync(["node", "burnless", "call", "delete_headcount", "--input", '{"id":"h1"}']);
    expect(process.exitCode).toBe(2);
    expect(stderr).toContain("Refusing to run delete tool");
  });
});
