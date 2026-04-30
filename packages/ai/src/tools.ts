/**
 * AI Tool definitions — functions the AI assistant can call to interact
 * with the financial engine.
 *
 * Uses provider-agnostic ToolDefinition format. Each provider implementation
 * maps these to its own SDK format internally.
 */

import type { ToolDefinition } from "./providers";

/** Tool definitions for the AI assistant's function-calling capability. */
const FINANCIAL_TOOLS: ToolDefinition[] = [
  {
    name: "create_scenario",
    description:
      "Create a new financial scenario (e.g., best case, worst case, custom what-if). Returns the new scenario ID.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name for the scenario (e.g., 'Aggressive Growth', 'Conservative')",
        },
        description: {
          type: "string",
          description: "Description of the scenario assumptions",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "create_expense",
    description:
      "Add an expense to the current scenario — defines how a specific expense account is projected over time. Use when the user says 'add a Slack subscription expense' or 'plan our cloud spend'. Always operates on the active scenario from context. Method-specific parameters: 'fixed' { amount }; 'growth_rate' { baseAmount, monthlyRate }; 'per_unit' { driver, unitPrice }; 'percentage_of' { ofAccountId, percentage }; 'custom_formula' { formula }.",
    inputSchema: {
      type: "object",
      properties: {
        accountId: {
          type: "string",
          description: "The account this forecast applies to (from Chart of Accounts in context)",
        },
        method: {
          type: "string",
          enum: ["fixed", "growth_rate", "per_unit", "percentage_of", "custom_formula"],
          description: "Forecasting method",
        },
        parameters: {
          type: "object",
          description: "Method-specific parameters. See tool description for per-method shapes.",
        },
        startDate: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
        },
        endDate: {
          type: ["string", "null"],
          description: "Optional end date in YYYY-MM-DD format. Omit or null for open-ended.",
        },
        notes: {
          type: ["string", "null"],
          description: "Free-form notes for this expense (memo, vendor URL, etc.).",
        },
        vendor: {
          type: ["string", "null"],
          description: "Vendor name (e.g., 'Slack', 'AWS'). Free-form text.",
        },
        departmentId: {
          type: ["string", "null"],
          description: "Department this expense belongs to (from context). Null if unassigned.",
        },
        frequency: {
          type: "string",
          enum: ["monthly", "quarterly", "annual"],
          description: "Billing/recognition cadence. Defaults to 'monthly'.",
        },
        isOneTime: {
          type: "boolean",
          description: "True for one-time charges (e.g., setup fees). Defaults to false.",
        },
        isRecurring: {
          type: ["boolean", "null"],
          description: "Tri-state recurring flag. true = explicit recurring, false = explicit non-recurring, null = unset (UI infers from variance). Optional.",
        },
      },
      required: ["accountId", "method", "parameters", "startDate"],
    },
  },
  {
    name: "add_headcount",
    description:
      "Add a headcount plan entry to the current scenario — plan to hire a role with salary and start date. Automatically creates personnel cost forecasts.",
    inputSchema: {
      type: "object",
      properties: {
        departmentId: {
          type: "string",
          description: "Department ID (from context)",
        },
        title: {
          type: "string",
          description: "Job title (e.g., 'Senior Engineer', 'Product Designer')",
        },
        count: {
          type: "number",
          description: "Number of people to hire for this role",
        },
        salary: {
          type: "number",
          description: "Annual salary per person",
        },
        startDate: {
          type: "string",
          description: "Hire start date (YYYY-MM-DD)",
        },
        endDate: {
          type: "string",
          description: "Optional end date for contract roles (YYYY-MM-DD)",
        },
        benefitsRate: {
          type: "number",
          description: "Benefits as a fraction of salary (e.g., 0.25 for 25%). Defaults to 0.2.",
        },
      },
      required: ["departmentId", "title", "count", "salary", "startDate"],
    },
  },
  {
    name: "update_headcount",
    description:
      "Update an existing headcount plan entry — change title, count, salary, dates, department, or benefits rate.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The headcount plan ID to update",
        },
        title: {
          type: "string",
          description: "New job title",
        },
        count: {
          type: "number",
          description: "New number of people",
        },
        salary: {
          type: "number",
          description: "New annual salary per person",
        },
        startDate: {
          type: "string",
          description: "New start date (YYYY-MM-DD)",
        },
        endDate: {
          type: "string",
          description: "New end date (YYYY-MM-DD) or null to remove",
        },
        benefitsRate: {
          type: "number",
          description: "New benefits rate (0-2)",
        },
        departmentId: {
          type: "string",
          description: "New department ID",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_headcount",
    description:
      "Delete a headcount plan entry.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The headcount plan ID to delete",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "update_department",
    description:
      "Rename an existing department.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The department ID to update",
        },
        name: {
          type: "string",
          description: "New department name",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_department",
    description:
      "Delete a department and all associated headcount plans.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The department ID to delete",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "add_revenue_stream",
    description:
      "Add a revenue stream to the current scenario — supports subscription (SaaS MRR), one-time, usage-based, and services revenue.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the revenue stream (e.g., 'SaaS Subscriptions', 'Consulting')",
        },
        type: {
          type: "string",
          enum: ["subscription", "one_time", "usage_based", "services"],
          description: "Revenue type",
        },
        parameters: {
          type: "object",
          description: "Type-specific parameters matching the engine contract. For 'subscription': { startingCustomers, monthlyPrice, newCustomersPerMonth, monthlyChurnRate (decimal, e.g. 0.05 for 5%) }. For 'one_time': { unitsPerMonth, pricePerUnit }. For 'usage_based': { activeUsers, avgUsagePerUser, pricePerUnit }. For 'services': { hoursPerMonth, hourlyRate }.",
        },
      },
      required: ["name", "type", "parameters"],
    },
  },
  {
    name: "update_scenario",
    description:
      "Update an existing financial scenario's name, type, or description.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The scenario ID to update (from context)",
        },
        name: {
          type: "string",
          description: "New name for the scenario",
        },
        type: {
          type: "string",
          enum: ["base", "best", "worst", "custom"],
          description: "New scenario type",
        },
        description: {
          type: "string",
          description: "New description",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_scenario",
    description:
      "Delete a financial scenario and all its associated forecast lines, headcount plans, and revenue streams. Cannot delete the default scenario.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The scenario ID to delete",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "update_revenue_stream",
    description:
      "Update an existing revenue stream's name, type, or parameters.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The revenue stream ID to update",
        },
        name: {
          type: "string",
          description: "New name",
        },
        type: {
          type: "string",
          enum: ["subscription", "one_time", "usage_based", "services"],
          description: "New revenue type",
        },
        parameters: {
          type: "object",
          description: "New type-specific parameters",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_revenue_stream",
    description:
      "Delete a revenue stream.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The revenue stream ID to delete",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "compare_scenarios",
    description:
      "Compare two financial scenarios side-by-side, showing differences in revenue, expenses, cash, and key metrics.",
    inputSchema: {
      type: "object",
      properties: {
        baseScenarioId: {
          type: "string",
          description: "The base scenario ID for comparison",
        },
        compareScenarioId: {
          type: "string",
          description: "The scenario to compare against the base",
        },
      },
      required: ["baseScenarioId", "compareScenarioId"],
    },
  },
  {
    name: "compute_metrics",
    description:
      "Compute all financial metrics for the active scenario over a time period. Returns MRR, ARR, burn rate, runway, growth rates, SaaS metrics, etc.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: {
          type: "string",
          description: "Start date (YYYY-MM)",
        },
        endDate: {
          type: "string",
          description: "End date (YYYY-MM)",
        },
      },
      required: [],
    },
  },
  {
    name: "generate_financial_statements",
    description:
      "Generate P&L (Profit & Loss), Cash Flow Statement, and Balance Sheet for the active scenario.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: {
          type: "string",
          description: "Start date (YYYY-MM)",
        },
        endDate: {
          type: "string",
          description: "End date (YYYY-MM)",
        },
      },
      required: [],
    },
  },
  {
    name: "add_funding_round",
    description:
      "Add a funding round (actual or projected) — models cash injection from investors, debt, or grants.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Round name (e.g., 'Seed Round', 'Series A')",
        },
        type: {
          type: "string",
          enum: ["pre_seed", "seed", "series_a", "series_b", "series_c_plus", "debt", "grant"],
          description: "Type of funding",
        },
        amount: {
          type: "number",
          description: "Funding amount in base currency",
        },
        date: {
          type: "string",
          description: "Expected date of funding (YYYY-MM-DD)",
        },
        preMoneyValuation: {
          type: "number",
          description: "Pre-money valuation (optional)",
        },
        dilutionPercent: {
          type: "number",
          description: "Dilution percentage (e.g., 0.15 for 15%)",
        },
        isProjected: {
          type: "boolean",
          description: "Whether this is a projected (future) round vs. completed",
        },
      },
      required: ["name", "type", "amount", "date"],
    },
  },
  {
    name: "update_funding_round",
    description:
      "Update an existing funding round's details — name, amount, date, valuation, dilution, or projected status.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The funding round ID to update",
        },
        name: {
          type: "string",
          description: "New round name",
        },
        type: {
          type: "string",
          enum: ["pre_seed", "seed", "series_a", "series_b", "series_c_plus", "debt", "grant"],
          description: "New funding type",
        },
        amount: {
          type: "number",
          description: "New funding amount",
        },
        date: {
          type: "string",
          description: "New date (YYYY-MM-DD)",
        },
        preMoneyValuation: {
          type: "number",
          description: "New pre-money valuation",
        },
        dilutionPercent: {
          type: "number",
          description: "New dilution percentage (e.g., 0.15 for 15%)",
        },
        isProjected: {
          type: "boolean",
          description: "Whether this is projected vs. completed",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_funding_round",
    description:
      "Delete a funding round.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The funding round ID to delete",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "update_expense",
    description:
      "Update an existing expense's method, parameters, dates, or metadata (vendor, notes, frequency, department, one-time/recurring flags). Use when the user says 'edit my Slack expense' or 'change the cloud spend growth rate'. Only fields supplied are patched. Method param shapes: 'fixed' { amount }; 'growth_rate' { baseAmount, monthlyRate }; 'per_unit' { driver, unitPrice }; 'percentage_of' { ofAccountId, percentage }; 'custom_formula' { formula }.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The forecast line ID to update",
        },
        method: {
          type: "string",
          enum: ["fixed", "growth_rate", "per_unit", "percentage_of", "custom_formula"],
          description: "New forecasting method",
        },
        parameters: {
          type: "object",
          description: "New method-specific parameters. See tool description for per-method shapes.",
        },
        startDate: {
          type: "string",
          description: "New start date (YYYY-MM-DD)",
        },
        endDate: {
          type: ["string", "null"],
          description: "New end date (YYYY-MM-DD) or null to clear",
        },
        notes: {
          type: ["string", "null"],
          description: "Free-form notes; null clears.",
        },
        vendor: {
          type: ["string", "null"],
          description: "Vendor name (e.g., 'Slack'); null clears.",
        },
        departmentId: {
          type: ["string", "null"],
          description: "Department ID; null clears the assignment.",
        },
        frequency: {
          type: "string",
          enum: ["monthly", "quarterly", "annual"],
          description: "Billing/recognition cadence.",
        },
        isOneTime: {
          type: "boolean",
          description: "Mark as one-time (true) or recurring/regular (false).",
        },
        isRecurring: {
          type: ["boolean", "null"],
          description: "Tri-state recurring flag. true = recurring, false = non-recurring, null = unset (UI infers).",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_expense",
    description:
      "Delete an expense and all its associated forecast values. Use this when the user says things like 'remove my Slack expense'.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The forecast line ID to delete",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "create_account",
    description:
      "Create a new financial account in the chart of accounts — for tracking a specific revenue or expense category.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Account name (e.g., 'Marketing Spend', 'Cloud Infrastructure')",
        },
        type: {
          type: "string",
          enum: ["income", "expense", "asset", "liability", "equity"],
          description: "Account type",
        },
        category: {
          type: "string",
          enum: ["revenue", "cogs", "operating_expense", "other_income", "other_expense", "asset", "liability", "equity"],
          description: "Account category for P&L classification",
        },
      },
      required: ["name", "type", "category"],
    },
  },
  {
    name: "update_account",
    description:
      "Update an existing financial account's name, type, or category. Cannot modify system accounts.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The account ID to update",
        },
        name: {
          type: "string",
          description: "New account name",
        },
        type: {
          type: "string",
          enum: ["income", "expense", "asset", "liability", "equity"],
          description: "New account type",
        },
        category: {
          type: "string",
          enum: ["revenue", "cogs", "operating_expense", "other_income", "other_expense", "asset", "liability", "equity"],
          description: "New account category",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_account",
    description:
      "Delete a financial account and all associated transactions and forecast lines. Cannot delete system accounts.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The account ID to delete",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "create_department",
    description:
      "Create a new department for organizing headcount plans.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Department name (e.g., 'Engineering', 'Sales', 'Marketing')",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "categorize_transactions",
    description:
      "Analyze uncategorized or miscategorized transactions and suggest appropriate account categories based on the description, amount, and existing chart of accounts.",
    inputSchema: {
      type: "object",
      properties: {
        transactions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Transaction ID" },
              description: { type: "string", description: "Transaction description from bank/CSV" },
              amount: { type: "number", description: "Transaction amount" },
              date: { type: "string", description: "Transaction date (YYYY-MM-DD)" },
            },
            required: ["description", "amount"],
          },
          description: "Array of transactions to categorize",
        },
      },
      required: ["transactions"],
    },
  },
  {
    name: "generate_report_narrative",
    description:
      "Generate a written narrative for investor reports or board updates based on the current financial data. Returns formatted markdown text ready for a board deck or investor letter.",
    inputSchema: {
      type: "object",
      properties: {
        reportType: {
          type: "string",
          enum: ["board_update", "investor_letter", "monthly_summary", "fundraising_memo"],
          description: "Type of narrative to generate",
        },
        period: {
          type: "string",
          description: "Period to cover (e.g., '2026-01' for a single month, or '2026-Q1' for a quarter)",
        },
        highlights: {
          type: "array",
          items: { type: "string" },
          description: "Optional key highlights or milestones to include",
        },
        tone: {
          type: "string",
          enum: ["formal", "conversational", "data_driven"],
          description: "Tone of the narrative. Defaults to 'formal'.",
        },
      },
      required: ["reportType"],
    },
  },
  {
    name: "suggest_cost_cuts",
    description:
      "Analyze current expenses in the active scenario and identify optimization opportunities — areas where spend could be reduced, renegotiated, or eliminated to extend runway.",
    inputSchema: {
      type: "object",
      properties: {
        targetSavingsPercent: {
          type: "number",
          description: "Target savings as a percentage of total expenses (e.g., 0.15 for 15%). If omitted, suggests all viable cuts.",
        },
        excludeCategories: {
          type: "array",
          items: { type: "string" },
          description: "Account categories to exclude from cost-cut suggestions (e.g., 'revenue', 'cogs')",
        },
      },
      required: [],
    },
  },
  {
    name: "benchmark_metrics",
    description:
      "Compare the company's key metrics against industry benchmarks for their stage and business model. Shows where the company is performing above, at, or below typical startups.",
    inputSchema: {
      type: "object",
      properties: {
        metrics: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "burn_rate", "runway", "revenue_growth", "gross_margin",
              "ltv_cac_ratio", "churn_rate", "burn_multiple", "rule_of_40",
              "magic_number", "net_dollar_retention", "cac_payback",
            ],
          },
          description: "Which metrics to benchmark. If omitted, benchmarks all available metrics.",
        },
        stage: {
          type: "string",
          enum: ["pre_seed", "seed", "series_a", "series_b", "growth"],
          description: "Company stage for benchmark selection. Auto-detected from company data if omitted.",
        },
      },
      required: [],
    },
  },
  {
    name: "model_dilution",
    description:
      "Model equity dilution from a potential funding round. Shows pre/post ownership percentages, option pool impact, and effective valuation.",
    inputSchema: {
      type: "object",
      properties: {
        roundAmount: {
          type: "number",
          description: "Amount to raise in this round",
        },
        preMoneyValuation: {
          type: "number",
          description: "Pre-money valuation",
        },
        existingOwnershipPercent: {
          type: "number",
          description: "Founder/team current ownership as a decimal (e.g., 0.80 for 80%). Defaults to 1.0 if first round.",
        },
        optionPoolPercent: {
          type: "number",
          description: "New option pool to create as a percent of post-money (e.g., 0.10 for 10%). Defaults to 0.",
        },
        existingRounds: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              amount: { type: "number" },
              ownership: { type: "number", description: "Ownership percentage acquired (decimal)" },
            },
          },
          description: "Previous funding rounds for cap table context",
        },
      },
      required: ["roundAmount", "preMoneyValuation"],
    },
  },
  {
    name: "web_search",
    description:
      "Search the web for real-time information — market data, competitor analysis, regulatory updates, industry benchmarks, economic indicators, and other current information that may not be in the company's own data. Returns the top results with titles, URLs, and snippets.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query. Be specific — include relevant context like 'SaaS', 'startup', year, geography, etc.",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results to return (1-10). Defaults to 5.",
        },
        timeRange: {
          type: "string",
          enum: ["day", "week", "month", "year"],
          description: "Restrict results to a time range. Useful for recent data.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "forecast_revenue",
    description:
      "Project future revenue for the active scenario based on historical trends with confidence intervals. Supports linear, exponential, and conservative growth models.",
    inputSchema: {
      type: "object",
      properties: {
        months: {
          type: "number",
          description: "Number of months to forecast forward (1-36). Defaults to 12.",
        },
        method: {
          type: "string",
          enum: ["linear", "exponential", "conservative", "auto"],
          description: "Forecasting method. 'auto' picks the best fit. Defaults to 'auto'.",
        },
        includeConfidenceIntervals: {
          type: "boolean",
          description: "Whether to include high/low confidence bands. Defaults to true.",
        },
      },
      required: [],
    },
  },
];

/**
 * Get tool definitions in provider-agnostic format.
 * Each provider maps these to its own SDK format internally.
 */
export function getFinancialTools(): ToolDefinition[] {
  return FINANCIAL_TOOLS;
}

/**
 * @deprecated Use getFinancialTools() instead. Kept for backward compatibility.
 * Will be removed in the next major version.
 */
export const financialTools = FINANCIAL_TOOLS;
