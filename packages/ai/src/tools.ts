/**
 * AI Tool definitions — functions the AI assistant can call to interact
 * with the financial engine. Each tool has a name, description, JSON schema
 * for input validation, and an execute function.
 *
 * Tool execution is handled server-side via the API layer, not here.
 * This module defines the tool schemas for the Claude API.
 */

import type Anthropic from "@anthropic-ai/sdk";

/** Tool definitions for Claude's tool_use feature. */
export const financialTools: Anthropic.Tool[] = [
  {
    name: "create_scenario",
    description:
      "Create a new financial scenario (e.g., best case, worst case, custom what-if). Returns the new scenario ID.",
    input_schema: {
      type: "object" as const,
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
    input_schema: {
      type: "object" as const,
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
    input_schema: {
      type: "object" as const,
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
    input_schema: {
      type: "object" as const,
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
    input_schema: {
      type: "object" as const,
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
    input_schema: {
      type: "object" as const,
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
    input_schema: {
      type: "object" as const,
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
    input_schema: {
      type: "object" as const,
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
    input_schema: {
      type: "object" as const,
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
    input_schema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Department name (e.g., 'Engineering', 'Sales', 'Marketing')",
        },
      },
      required: ["name"],
    },
  },
];
