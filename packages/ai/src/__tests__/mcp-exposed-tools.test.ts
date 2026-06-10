/**
 * Regression guard for the MCP server tool surface (expose spec §4.4):
 * no genui / propose_plan / web tool may leak into the exposed list, the
 * list is substantial (full financial mirror), and activate_scenario stays
 * exposed (session-scoped on the server — spec §4.4 last bullet).
 */
import { describe, it, expect } from "vitest";
import { getFinancialTools, getMcpExposedTools, MCP_SERVER_EXCLUDED_TOOLS } from "../index";
import { GENUI_DISPLAY_TOOLS, GENUI_INPUT_TOOLS } from "../tools-genui";

describe("MCP_SERVER_EXCLUDED_TOOLS (spec §4.4)", () => {
  it("contains every genui tool name (derived, not hand-listed)", () => {
    for (const t of [...GENUI_DISPLAY_TOOLS, ...GENUI_INPUT_TOOLS]) {
      expect(MCP_SERVER_EXCLUDED_TOOLS.has(t.name)).toBe(true);
    }
  });

  it("contains the chat-loop + web exclusions", () => {
    for (const name of ["propose_plan", "search_web", "read_webpage", "read_webpage_rendered"]) {
      expect(MCP_SERVER_EXCLUDED_TOOLS.has(name)).toBe(true);
    }
  });
});

describe("getMcpExposedTools (spec §4.4 / B1)", () => {
  it("excludes every excluded tool and nothing else", () => {
    const exposed = getMcpExposedTools();
    const exposedNames = new Set(exposed.map((t) => t.name));
    for (const name of MCP_SERVER_EXCLUDED_TOOLS) {
      expect(exposedNames.has(name)).toBe(false);
    }
    // exposed + excluded = the full registry (no third bucket)
    expect(exposed.length + MCP_SERVER_EXCLUDED_TOOLS.size).toBe(getFinancialTools().length);
  });

  it("is a substantial financial mirror (≥ 20 tools) incl. the core surface", () => {
    const names = new Set(getMcpExposedTools().map((t) => t.name));
    expect(names.size).toBeGreaterThanOrEqual(20);
    for (const core of ["get_metrics", "get_financial_statements", "create_scenario", "activate_scenario", "create_headcount", "create_funding_round"]) {
      expect(names.has(core)).toBe(true);
    }
  });

  it("every exposed tool carries the same JSON schema as the Companion's", () => {
    const bySlug = new Map(getFinancialTools().map((t) => [t.name, t]));
    for (const tool of getMcpExposedTools()) {
      expect(tool.inputSchema).toBe(bySlug.get(tool.name)!.inputSchema);
    }
  });
});
