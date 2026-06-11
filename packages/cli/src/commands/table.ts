/**
 * The curated noun-verb surface (spec §7.4, decision C2). A STATIC table —
 * drift-tested against getFinancialTools() minus MCP_SERVER_EXCLUDED_TOOLS in
 * src/__tests__/table-drift.test.ts so registry renames break CI, not users.
 * `verb: null` means the noun itself is the command (e.g. `burnless metrics`).
 */
export interface ArgSpec {
  name: string; // positional arg display name
  key: string; // tool input property
  description: string;
}

export interface FlagSpec {
  flag: string; // commander flag string, e.g. "--start <date>" (boolean flags omit the value)
  key: string; // tool input property
  description: string;
  type: "string" | "number" | "boolean" | "json";
  required?: boolean;
}

export interface ToolCommandEntry {
  kind: "tool";
  noun: string;
  verb: string | null;
  tool: string;
  summary: string;
  args: ArgSpec[];
  flags: FlagSpec[];
}

export interface ResourceCommandEntry {
  kind: "resource";
  noun: string;
  verb: string | null;
  resourceUri: string; // burnless://reports/* (spec §4.5)
  supportsPeriod: boolean;
  summary: string;
}

export type CommandEntry = ToolCommandEntry | ResourceCommandEntry;

const periodFlags: FlagSpec[] = [
  { flag: "--from <month>", key: "startDate", description: "start month YYYY-MM", type: "string" },
  { flag: "--to <month>", key: "endDate", description: "end month YYYY-MM", type: "string" },
];

export const COMMAND_TABLE: readonly CommandEntry[] = [
  // ── top-level reads ──────────────────────────────────────────────────────
  {
    kind: "tool",
    noun: "metrics",
    verb: null,
    tool: "get_metrics",
    summary: "Compute financial metrics (MRR, ARR, burn, runway, …) for the active scenario",
    args: [],
    flags: periodFlags,
  },
  {
    kind: "tool",
    noun: "statements",
    verb: null,
    tool: "get_financial_statements",
    summary: "P&L statement + cash-flow summary for the active scenario",
    args: [],
    flags: periodFlags,
  },

  // ── scenarios ────────────────────────────────────────────────────────────
  {
    kind: "tool",
    noun: "scenarios",
    verb: "list",
    tool: "list_scenarios",
    summary: "List scenarios with override headlines",
    args: [],
    flags: [],
  },
  {
    kind: "tool",
    noun: "scenarios",
    verb: "create",
    tool: "create_scenario",
    summary: "Create a what-if scenario",
    args: [{ name: "name", key: "name", description: "scenario name" }],
    flags: [{ flag: "--description <text>", key: "description", description: "scenario assumptions", type: "string" }],
  },
  {
    kind: "tool",
    noun: "scenarios",
    verb: "activate",
    tool: "activate_scenario",
    summary: "Activate a scenario in this CLI invocation's MCP session (use --scenario on other commands to target one per call)",
    args: [{ name: "id", key: "scenarioId", description: "scenario id" }],
    flags: [],
  },
  {
    kind: "tool",
    noun: "scenarios",
    verb: "compare",
    tool: "get_scenario_comparison",
    summary: "Compare two scenarios side-by-side",
    args: [
      { name: "base", key: "baseScenarioId", description: "base scenario id" },
      { name: "compare", key: "compareScenarioId", description: "scenario id to compare against base" },
    ],
    flags: [],
  },

  // ── headcount ────────────────────────────────────────────────────────────
  {
    kind: "tool",
    noun: "headcount",
    verb: "create",
    tool: "create_headcount",
    summary: "Add a headcount plan entry",
    args: [],
    flags: [
      { flag: "--department <id>", key: "departmentId", description: "department id", type: "string", required: true },
      { flag: "--title <title>", key: "title", description: "job title", type: "string", required: true },
      { flag: "--salary <amount>", key: "salary", description: "annual salary per person", type: "number", required: true },
      { flag: "--start <date>", key: "startDate", description: "hire date YYYY-MM-DD", type: "string", required: true },
      { flag: "--count <n>", key: "count", description: "FTE count (fractions ok)", type: "number" },
      { flag: "--type <type>", key: "employeeType", description: "full_time | part_time | contractor", type: "string" },
      { flag: "--end <date>", key: "endDate", description: "end date YYYY-MM-DD (contract roles)", type: "string" },
    ],
  },
  {
    kind: "tool",
    noun: "headcount",
    verb: "update",
    tool: "update_headcount",
    summary: "Update a headcount plan entry",
    args: [{ name: "id", key: "id", description: "headcount plan id" }],
    flags: [
      { flag: "--title <title>", key: "title", description: "new job title", type: "string" },
      { flag: "--salary <amount>", key: "salary", description: "new annual salary", type: "number" },
      { flag: "--count <n>", key: "count", description: "FTE count (fractions ok)", type: "number" },
      { flag: "--type <type>", key: "employeeType", description: "full_time | part_time | contractor", type: "string" },
      { flag: "--start <date>", key: "startDate", description: "new start date YYYY-MM-DD", type: "string" },
      { flag: "--end <date>", key: "endDate", description: "new end date YYYY-MM-DD", type: "string" },
      { flag: "--department <id>", key: "departmentId", description: "new department id", type: "string" },
    ],
  },
  {
    kind: "tool",
    noun: "headcount",
    verb: "delete",
    tool: "delete_headcount",
    summary: "Delete a headcount plan entry",
    args: [{ name: "id", key: "id", description: "headcount plan id" }],
    flags: [],
  },

  // ── revenue ──────────────────────────────────────────────────────────────
  {
    kind: "tool",
    noun: "revenue",
    verb: "create",
    tool: "create_revenue_stream",
    summary: "Add a revenue stream (subscription, one_time, usage_based, services, marketplace, ecommerce, hardware)",
    args: [{ name: "name", key: "name", description: "revenue stream name" }],
    flags: [
      { flag: "--type <type>", key: "type", description: "revenue type (e.g. subscription)", type: "string", required: true },
      { flag: "--start <date>", key: "startDate", description: "start date YYYY-MM-DD", type: "string", required: true },
      { flag: "--params <json>", key: "parameters", description: "type-specific engine parameters as JSON", type: "json", required: true },
      { flag: "--end <date>", key: "endDate", description: "end date YYYY-MM-DD", type: "string" },
    ],
  },
  {
    kind: "tool",
    noun: "revenue",
    verb: "update",
    tool: "update_revenue_stream",
    summary: "Update a revenue stream",
    args: [{ name: "id", key: "id", description: "revenue stream id" }],
    flags: [
      { flag: "--name <name>", key: "name", description: "new name", type: "string" },
      { flag: "--type <type>", key: "type", description: "new revenue type", type: "string" },
      { flag: "--start <date>", key: "startDate", description: "new start date YYYY-MM-DD", type: "string" },
      { flag: "--end <date>", key: "endDate", description: "new end date YYYY-MM-DD", type: "string" },
      { flag: "--params <json>", key: "parameters", description: "parameters JSON (deep-merged server-side)", type: "json" },
    ],
  },
  {
    kind: "tool",
    noun: "revenue",
    verb: "delete",
    tool: "delete_revenue_stream",
    summary: "Delete a revenue stream",
    args: [{ name: "id", key: "id", description: "revenue stream id" }],
    flags: [],
  },

  // ── funding ──────────────────────────────────────────────────────────────
  {
    kind: "tool",
    noun: "funding",
    verb: "create",
    tool: "create_funding_round",
    summary: "Create a funding round (roundType is immutable after creation)",
    args: [{ name: "name", key: "name", description: "round name" }],
    flags: [
      { flag: "--type <type>", key: "roundType", description: "pre_seed | seed | series_a | series_b | series_c_plus | safe | convertible | debt | grant", type: "string", required: true },
      { flag: "--amount <amount>", key: "amount", description: "total round size in base currency", type: "number", required: true },
      { flag: "--date <date>", key: "date", description: "expected/actual close date YYYY-MM-DD", type: "string", required: true },
      { flag: "--pre-money <amount>", key: "preMoneyValuation", description: "pre-money valuation", type: "number" },
      { flag: "--dilution <pct>", key: "dilutionPercent", description: "dilution percentage 0-100", type: "number" },
      { flag: "--notes <text>", key: "notes", description: "free-form notes", type: "string" },
      { flag: "--params <json>", key: "parameters", description: "round-type-specific parameters as JSON", type: "json" },
      { flag: "--projected", key: "isProjected", description: "mark as a projected (future) round", type: "boolean" },
    ],
  },
  {
    kind: "tool",
    noun: "funding",
    verb: "update",
    tool: "update_funding_round",
    summary: "Update a funding round's mutable fields (roundType cannot change)",
    args: [{ name: "id", key: "id", description: "funding round id" }],
    flags: [
      { flag: "--name <name>", key: "name", description: "new round name", type: "string" },
      { flag: "--amount <amount>", key: "amount", description: "new funding amount", type: "number" },
      { flag: "--date <date>", key: "date", description: "new date YYYY-MM-DD", type: "string" },
      { flag: "--notes <text>", key: "notes", description: "updated notes", type: "string" },
      { flag: "--params <json>", key: "parameters", description: "updated round parameters as JSON (merged)", type: "json" },
      { flag: "--projected", key: "isProjected", description: "mark as projected", type: "boolean" },
    ],
  },
  {
    kind: "tool",
    noun: "funding",
    verb: "delete",
    tool: "delete_funding_round",
    summary: "Delete a funding round and its investors",
    args: [{ name: "id", key: "id", description: "funding round id" }],
    flags: [],
  },

  // ── forecast (expense/projection lines) ──────────────────────────────────
  {
    kind: "tool",
    noun: "forecast",
    verb: "create",
    tool: "create_forecast_line",
    summary: "Create a forecast line (monthly projection rule for an account)",
    args: [],
    flags: [
      { flag: "--account <id>", key: "accountId", description: "chart-of-accounts account id", type: "string", required: true },
      { flag: "--method <method>", key: "method", description: "fixed | growth_rate | per_unit | percentage_of | custom_formula", type: "string", required: true },
      { flag: "--params <json>", key: "parameters", description: "method-specific parameters as JSON", type: "json", required: true },
      { flag: "--start <date>", key: "startDate", description: "start date YYYY-MM-DD", type: "string", required: true },
      { flag: "--end <date>", key: "endDate", description: "end date YYYY-MM-DD", type: "string" },
      { flag: "--vendor <name>", key: "vendor", description: "vendor name (e.g. 'AWS')", type: "string" },
      { flag: "--notes <text>", key: "notes", description: "free-form notes", type: "string" },
    ],
  },
  {
    kind: "tool",
    noun: "forecast",
    verb: "update",
    tool: "update_forecast_line",
    summary: "Update a forecast line",
    args: [{ name: "id", key: "id", description: "forecast line id" }],
    flags: [
      { flag: "--method <method>", key: "method", description: "new forecasting method", type: "string" },
      { flag: "--params <json>", key: "parameters", description: "new method parameters as JSON", type: "json" },
      { flag: "--start <date>", key: "startDate", description: "new start date YYYY-MM-DD", type: "string" },
      { flag: "--end <date>", key: "endDate", description: "new end date YYYY-MM-DD", type: "string" },
      { flag: "--vendor <name>", key: "vendor", description: "vendor name", type: "string" },
      { flag: "--notes <text>", key: "notes", description: "notes", type: "string" },
    ],
  },
  {
    kind: "tool",
    noun: "forecast",
    verb: "delete",
    tool: "delete_forecast_line",
    summary: "Delete a forecast line",
    args: [{ name: "id", key: "id", description: "forecast line id" }],
    flags: [],
  },

  // ── reports — MCP resource reads (spec §4.5) ─────────────────────────────
  {
    kind: "resource",
    noun: "reports",
    verb: "pnl",
    resourceUri: "burnless://reports/pnl",
    supportsPeriod: true,
    summary: "P&L report (read-only resource)",
  },
  {
    kind: "resource",
    noun: "reports",
    verb: "cash-flow",
    resourceUri: "burnless://reports/cash-flow",
    supportsPeriod: true,
    summary: "Cash-flow report (read-only resource)",
  },
  {
    kind: "resource",
    noun: "reports",
    verb: "metrics",
    resourceUri: "burnless://reports/metrics",
    supportsPeriod: true,
    summary: "Metrics report (read-only resource)",
  },
  {
    kind: "resource",
    noun: "reports",
    verb: "cap-table",
    resourceUri: "burnless://reports/cap-table",
    supportsPeriod: false,
    summary: "Cap table (read-only resource)",
  },
];
