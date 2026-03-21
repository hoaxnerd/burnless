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
        type: {
          type: "string",
          enum: ["base", "best", "worst", "custom"],
          description: "Scenario type",
        },
        description: {
          type: "string",
          description: "Description of the scenario assumptions",
        },
      },
      required: ["name", "type"],
    },
  },
  {
    name: "create_forecast_line",
    description:
      "Add a forecast line to a scenario — defines how a specific account is projected over time (e.g., fixed monthly amount, growth rate, percentage of another account).",
    inputSchema: {
      type: "object",
      properties: {
        scenarioId: {
          type: "string",
          description: "The scenario to add the forecast to. Use the current scenario ID from context unless the user specifies otherwise.",
        },
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
          description: "Method-specific parameters. For 'fixed': { amount: number }. For 'growth_rate': { startAmount: number, monthlyRate: number }. For 'per_unit': { units: number, pricePerUnit: number }. For 'percentage_of': { accountId: string, percentage: number }.",
        },
        startDate: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
        },
        endDate: {
          type: "string",
          description: "Optional end date in YYYY-MM-DD format. Omit for open-ended forecasts.",
        },
      },
      required: ["scenarioId", "accountId", "method", "parameters", "startDate"],
    },
  },
  {
    name: "add_headcount",
    description:
      "Add a headcount plan entry — plan to hire a role with salary and start date. Automatically creates personnel cost forecasts.",
    inputSchema: {
      type: "object",
      properties: {
        scenarioId: {
          type: "string",
          description: "Scenario to add headcount to",
        },
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
      required: ["scenarioId", "departmentId", "title", "count", "salary", "startDate"],
    },
  },
  {
    name: "add_revenue_stream",
    description:
      "Add a revenue stream to model income — supports subscription (SaaS MRR), one-time, usage-based, and services revenue.",
    inputSchema: {
      type: "object",
      properties: {
        scenarioId: {
          type: "string",
          description: "Scenario to add revenue to",
        },
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
          description: "Type-specific parameters. For 'subscription': { startingCustomers, monthlyPrice, growthRate, churnRate }. For 'one_time': { amount, frequency }. For 'usage_based': { usersCount, usagePerUser, pricePerUnit }. For 'services': { monthlyRevenue, growthRate }.",
        },
      },
      required: ["scenarioId", "name", "type", "parameters"],
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
      "Compute all financial metrics for a scenario over a time period. Returns MRR, ARR, burn rate, runway, growth rates, SaaS metrics, etc.",
    inputSchema: {
      type: "object",
      properties: {
        scenarioId: {
          type: "string",
          description: "Scenario to compute metrics for",
        },
        startDate: {
          type: "string",
          description: "Start date (YYYY-MM)",
        },
        endDate: {
          type: "string",
          description: "End date (YYYY-MM)",
        },
      },
      required: ["scenarioId"],
    },
  },
  {
    name: "generate_financial_statements",
    description:
      "Generate P&L (Profit & Loss), Cash Flow Statement, and Balance Sheet for a scenario.",
    inputSchema: {
      type: "object",
      properties: {
        scenarioId: {
          type: "string",
          description: "Scenario to generate statements for",
        },
        startDate: {
          type: "string",
          description: "Start date (YYYY-MM)",
        },
        endDate: {
          type: "string",
          description: "End date (YYYY-MM)",
        },
      },
      required: ["scenarioId"],
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
      "Analyze current expenses and identify optimization opportunities — areas where spend could be reduced, renegotiated, or eliminated to extend runway.",
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
        scenarioId: {
          type: "string",
          description: "Scenario to analyze. Uses current scenario if omitted.",
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
      "Project future revenue based on historical trends with confidence intervals. Supports linear, exponential, and conservative growth models.",
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
        scenarioId: {
          type: "string",
          description: "Scenario to base forecast on. Uses current scenario if omitted.",
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
