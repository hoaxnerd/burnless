/**
 * Retired AI tool names → their current canonical equivalents.
 *
 * The 2026-05 naming cleanup renamed many tools. Audit logs
 * (`aiToolAuditLogs.toolName`) and any persisted conversation history may still
 * hold the old names, so analytics/reporting that groups by tool name must
 * canonicalize first. Every value is a CURRENT, live tool name.
 */
export const TOOL_NAME_ALIASES: Record<string, string> = {
  // Write — create/update/delete
  create_expense: "create_forecast_line",
  update_expense: "update_forecast_line",
  delete_expense: "delete_forecast_line",
  add_revenue_stream: "create_revenue_stream",
  add_headcount: "create_headcount",
  add_salary_change: "create_salary_change",
  add_bonus: "create_bonus",
  add_equity_grant: "create_equity_grant",
  add_funding_round_investor: "create_funding_round_investor",
  mark_grant_milestone_hit: "update_grant_milestone",
  // Read
  compute_metrics: "get_metrics",
  generate_financial_statements: "get_financial_statements",
  forecast_revenue: "get_revenue_projection",
  benchmark_metrics: "get_metric_benchmarks",
  compare_scenarios: "get_scenario_comparison",
  model_dilution: "get_dilution_projection",
  suggest_cost_cuts: "get_expense_analysis",
  generate_report_narrative: "get_report_data",
  categorize_transactions: "get_transaction_categories",
  // Web (legacy `search` folds into the canonical web search)
  web_search: "search_web",
  search: "search_web",
  crawl: "read_webpage",
};

/** Resolve a possibly-retired tool name to its current canonical name. */
export function canonicalToolName(name: string): string {
  return TOOL_NAME_ALIASES[name] ?? name;
}
