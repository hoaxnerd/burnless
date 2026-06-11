import { describe, expect, it } from "vitest";
// devDependency-only import (test-time): never bundled into dist (tsup entry
// graph does not reach this file). MCP_SERVER_EXCLUDED_TOOLS is Plan B's
// export (spec §9.4).
import { MCP_SERVER_EXCLUDED_TOOLS, getFinancialTools } from "@burnless/ai";
import { COMMAND_TABLE } from "../commands/table";

describe("COMMAND_TABLE drift (spec §7.4: drift-tested against the tool registry)", () => {
  it("every tool-backed command maps to a tool on the exposed MCP surface", () => {
    const excluded = new Set<string>(MCP_SERVER_EXCLUDED_TOOLS as Iterable<string>);
    const exposed = new Set(
      getFinancialTools()
        .map((tool) => tool.name)
        .filter((name) => !excluded.has(name))
    );
    for (const entry of COMMAND_TABLE) {
      if (entry.kind !== "tool") continue;
      const label = `burnless ${entry.noun}${entry.verb === null ? "" : " " + entry.verb}`;
      expect(exposed.has(entry.tool), `${label} maps to "${entry.tool}" which is not exposed over MCP`).toBe(true);
    }
  });

  it("noun+verb pairs are unique", () => {
    const seen = new Set<string>();
    for (const entry of COMMAND_TABLE) {
      const key = `${entry.noun} ${entry.verb ?? ""}`;
      expect(seen.has(key), `duplicate command: ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it("resource commands all target burnless://reports/* (spec §4.5)", () => {
    for (const entry of COMMAND_TABLE) {
      if (entry.kind !== "resource") continue;
      expect(entry.resourceUri.startsWith("burnless://reports/")).toBe(true);
    }
  });

  it("covers the spec-mandated surface", () => {
    const keys = COMMAND_TABLE.map((e) => `${e.noun} ${e.verb ?? ""}`.trim());
    for (const required of [
      "metrics",
      "statements",
      "scenarios list",
      "scenarios create",
      "scenarios activate",
      "scenarios compare",
      "headcount create",
      "headcount update",
      "headcount delete",
      "revenue create",
      "revenue update",
      "revenue delete",
      "funding create",
      "funding update",
      "funding delete",
      "forecast create",
      "forecast update",
      "forecast delete",
      "reports pnl",
      "reports cash-flow",
      "reports metrics",
      "reports cap-table",
    ]) {
      expect(keys, `missing command: ${required}`).toContain(required);
    }
  });
});
