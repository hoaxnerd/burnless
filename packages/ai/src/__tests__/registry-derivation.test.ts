/**
 * A2 registry derivation snapshot gate.
 *
 * These tests freeze the EXACT membership of each derived set as it existed
 * before the A2a refactor. The EXPECTED_* literals were copied verbatim from
 * the pre-refactor hand-maintained sets/arrays. After the refactor the same
 * test must stay green — proving ZERO behavior change.
 *
 * CRITICAL: Do NOT edit EXPECTED_* values. If a derivation disagrees, fix the
 * derivation or its annotations, not the expected snapshot.
 */
import { describe, it, expect } from "vitest";
import {
  getFinancialTools,
  SCENARIO_TARGETABLE_TOOLS,
  MCP_SERVER_EXCLUDED_TOOLS,
} from "../tools";
import { DISPLAY_TOOL_NAMES, INPUT_TOOL_NAMES } from "../generative-ui";
import { MUTATION_TOOL_NAMES, categorizeToolName } from "../permissions";

const sorted = (s: Iterable<string>) => [...s].sort();

// ── Frozen snapshots (pre-refactor source of truth) ──────────────────────────

const EXPECTED_SCENARIO_TARGETABLE = [
  "create_account",
  "create_bonus",
  "create_department",
  "create_equity_grant",
  "create_forecast_line",
  "create_funding_round",
  "create_headcount",
  "create_revenue_stream",
  "create_salary_change",
  "delete_account",
  "delete_department",
  "delete_forecast_line",
  "delete_funding_round",
  "delete_headcount",
  "delete_revenue_stream",
  "update_account",
  "update_department",
  "update_forecast_line",
  "update_funding_round",
  "update_grant_milestone",
  "update_headcount",
  "update_revenue_stream",
];

// 17 display (16 show_* + propose_scheduled_job) + 4 input + 3 manual =
// propose_plan, search_web, read_webpage
const EXPECTED_MCP_EXCLUDED = [
  "propose_plan",
  "propose_scheduled_job",
  "read_webpage",
  "request_forecast_line",
  "request_headcount",
  "request_input_form",
  "request_revenue_stream",
  "search_web",
  "show_area_chart",
  "show_bar_chart",
  "show_burn_breakdown",
  "show_callout",
  "show_cap_table",
  "show_checklist",
  "show_comparison_table",
  "show_data_table",
  "show_funding_summary",
  "show_kpi_grid",
  "show_line_chart",
  "show_metric_card",
  "show_progress_steps",
  "show_runway",
  "show_scenario_diff",
  "show_suggested_actions",
];

const EXPECTED_DISPLAY = [
  "propose_scheduled_job",
  "show_area_chart",
  "show_bar_chart",
  "show_burn_breakdown",
  "show_callout",
  "show_cap_table",
  "show_checklist",
  "show_comparison_table",
  "show_data_table",
  "show_funding_summary",
  "show_kpi_grid",
  "show_line_chart",
  "show_metric_card",
  "show_progress_steps",
  "show_runway",
  "show_scenario_diff",
  "show_suggested_actions",
];

const EXPECTED_INPUT = [
  "request_forecast_line",
  "request_headcount",
  "request_input_form",
  "request_revenue_stream",
];

// ── Assertions ────────────────────────────────────────────────────────────────

describe("A2 registry derivation reproduces current membership", () => {
  it("SCENARIO_TARGETABLE_TOOLS", () =>
    expect(sorted(SCENARIO_TARGETABLE_TOOLS)).toEqual(EXPECTED_SCENARIO_TARGETABLE));

  it("MCP_SERVER_EXCLUDED_TOOLS", () =>
    expect(sorted(MCP_SERVER_EXCLUDED_TOOLS)).toEqual(EXPECTED_MCP_EXCLUDED));

  it("DISPLAY_TOOL_NAMES", () =>
    expect(sorted(DISPLAY_TOOL_NAMES)).toEqual(EXPECTED_DISPLAY));

  it("INPUT_TOOL_NAMES", () =>
    expect(sorted(INPUT_TOOL_NAMES)).toEqual(EXPECTED_INPUT));

  it("excluded ∪ exposed partitions the registry (no third bucket)", () => {
    const all = getFinancialTools().map((t) => t.name);
    const exposed = all.filter((n) => !MCP_SERVER_EXCLUDED_TOOLS.has(n));
    expect(exposed.length + MCP_SERVER_EXCLUDED_TOOLS.size).toBe(all.length);
  });
});

// ── A2b: write/delete/mutation derivation snapshot ──────────────────────────
//
// Frozen from the hand-maintained WRITE_TOOLS / DELETE_TOOLS in permissions.ts
// before A2b. EXPECTED_* values are the authoritative contract — do NOT edit.

const EXPECTED_WRITE = [
  "create_account",
  "create_bonus",
  "create_department",
  "create_equity_grant",
  "create_forecast_line",
  "create_funding_round",
  "create_funding_round_investor",
  "create_headcount",
  "create_revenue_stream",
  "create_salary_change",
  "create_scenario",
  "record_transaction",
  "update_account",
  "update_department",
  "update_forecast_line",
  "update_funding_round",
  "update_grant_milestone",
  "update_headcount",
  "update_revenue_stream",
  "update_scenario",
];

const EXPECTED_DELETE = [
  "delete_account",
  "delete_department",
  "delete_forecast_line",
  "delete_funding_round",
  "delete_headcount",
  "delete_revenue_stream",
  "delete_scenario",
];

const EXPECTED_MUTATION = [
  ...EXPECTED_WRITE,
  ...EXPECTED_DELETE,
].sort();

describe("A2b: MUTATION_TOOL_NAMES derived from mutates annotations", () => {
  it("MUTATION_TOOL_NAMES membership matches frozen snapshot", () =>
    expect(sorted(MUTATION_TOOL_NAMES)).toEqual(EXPECTED_MUTATION));

  it("every delete_* mutation categorizes as delete", () => {
    for (const n of MUTATION_TOOL_NAMES) {
      if (n.startsWith("delete_")) {
        expect(categorizeToolName(n), `${n} should be delete`).toBe("delete");
      }
    }
  });

  it("every non-delete mutation categorizes as write", () => {
    for (const n of MUTATION_TOOL_NAMES) {
      if (!n.startsWith("delete_")) {
        expect(categorizeToolName(n), `${n} should be write`).toBe("write");
      }
    }
  });

  it("record_transaction has mutates:write and no cacheTags (intentionally uncached)", () => {
    const tools = getFinancialTools();
    const rt = tools.find((t) => t.name === "record_transaction");
    expect(rt).toBeDefined();
    expect(rt!.mutates).toBe("write");
    expect(rt!.cacheTags).toBeUndefined();
  });
});
