/**
 * AI Tool definitions — functions the AI assistant can call to interact
 * with the financial engine.
 *
 * Uses provider-agnostic ToolDefinition format. Each provider implementation
 * maps these to its own SDK format internally.
 */

import type { ToolDefinition } from "./providers";
import { GENUI_DISPLAY_TOOLS, GENUI_INPUT_TOOLS } from "./tools-genui";

/** Tool definitions for the AI assistant's function-calling capability. */
const FINANCIAL_TOOLS: ToolDefinition[] = [
  {
    name: "propose_plan",
    description:
      "Before performing any data change (create/update/delete) or a multi-step task, call this to show the user an editable plan and PAUSE for approval. List the steps you intend to take in order — for steps that will call a tool, set kind:\"tool\" and name it; for explanatory steps set kind:\"note\". Add a short `rationale` and a `confidence` of \"high\" or \"low\" per step. The user reviews/edits the plan; on approval the plan comes back to you as a tool result and you then execute the steps (each data change still goes through its own confirmation). Do NOT call propose_plan for a simple read-only question — just answer it.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short title for the plan." },
        description: { type: "string", description: "Optional one-line summary." },
        steps: {
          type: "array",
          description: "Ordered steps you intend to take.",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["tool", "note"], description: "\"tool\" if this step calls a tool, else \"note\"." },
              title: { type: "string", description: "Human-readable step label." },
              toolName: { type: "string", description: "For kind:tool — the tool you'll call." },
              toolInput: { type: "object", description: "For kind:tool — the proposed arguments." },
              rationale: { type: "string", description: "Why this step." },
              confidence: { type: "string", enum: ["high", "low"], description: "Your confidence in this step." },
            },
            required: ["kind", "title"],
          },
        },
      },
      required: ["title", "steps"],
    },
  },
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
    name: "activate_scenario",
    description:
      "Switch the user's ACTIVE scenario view to an existing scenario by id, so it appears in the UI (the scenario bar at the top) and their pages reflect it. Use when the user asks to open / switch to / work in a specific existing scenario. This is a read-only VIEW change — it does not modify any data and is not gated. For a NEW scenario use create_scenario (which activates it automatically). Reading from a scenario for comparison does NOT need this — get_scenario_comparison reads any scenario by id.",
    inputSchema: {
      type: "object",
      properties: {
        scenarioId: {
          type: "string",
          description: "The id of the existing scenario to activate (from context).",
        },
      },
      required: ["scenarioId"],
    },
  },
  {
    name: "list_scenarios",
    description:
      "List the company's existing scenarios, each with a short diff headline (how many overrides it has, by entity type + action) so you can SEE what what-ifs already exist and what each one changes. ALWAYS call this before create_scenario to avoid creating a duplicate of a scenario that already exists — if a matching one exists, activate_scenario it instead. Read-only.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "create_forecast_line",
    description:
      "Create a forecast line — a monthly projection rule for ANY account (revenue, COGS, operating expense, other income/expense). NOT an actual transaction; it defines how the account's amount evolves over time. For subscription/usage/services revenue prefer create_revenue_stream instead. Method-specific parameters: 'fixed' { amount }; 'growth_rate' { baseAmount, monthlyGrowthRate }; 'per_unit' { units, pricePerUnit, unitGrowthRate?, priceGrowthRate? }; 'percentage_of' { sourceLineId, percentage }; 'custom_formula' { expression, variables? }.",
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
    name: "create_headcount",
    description:
      "Add a headcount plan entry to the current scenario. Canonical engine fields: title, name (individual hire name), employeeType (full_time | part_time | contractor), count (FTE — supports fractions like 0.5), salary (annual), hourlyRate (for contractors / part-time hourly), hoursPerWeek (40 = full-time baseline), startDate, endDate, departmentId, benefitsRate (legacy fallback), and parameters.benefitsBreakdown with the four fractions { statutoryEmployerContributionsCost, insuranceBenefitsCost, retirementContributionsCost, otherBenefitsCost }.",
    inputSchema: {
      type: "object",
      properties: {
        departmentId: { type: "string", description: "Department ID (from context)" },
        title: { type: "string", description: "Job title (e.g., 'Senior Engineer', 'Product Designer')" },
        name: { type: ["string", "null"], description: "Individual hire name (null to clear)" },
        employeeType: {
          type: "string",
          enum: ["full_time", "part_time", "contractor"],
          description: "Employee type. Defaults to full_time.",
        },
        count: {
          type: "number",
          description: "FTE count, supports fractions (0.5 = half-time). Defaults to 1.",
        },
        salary: { type: "number", description: "Annual salary per person" },
        hourlyRate: {
          type: ["number", "null"],
          description: "Hourly rate for contractors or hourly part-time",
        },
        hoursPerWeek: {
          type: ["number", "null"],
          description: "Hours per week (40 = full-time baseline)",
        },
        startDate: { type: "string", description: "Hire start date (YYYY-MM-DD)" },
        endDate: {
          type: "string",
          description: "Optional end date for contract roles (YYYY-MM-DD)",
        },
        benefitsRate: {
          type: "number",
          description: "Legacy flat benefits rate as a fraction of salary (0-2). Defaults to 0.2.",
        },
        parameters: {
          type: "object",
          description:
            "Deep-merged into existing parameters. Use parameters.benefitsBreakdown to set the 4 component fractions.",
          properties: {
            benefitsBreakdown: {
              type: "object",
              properties: {
                statutoryEmployerContributionsCost: { type: "number", minimum: 0, maximum: 1 },
                insuranceBenefitsCost: { type: "number", minimum: 0, maximum: 1 },
                retirementContributionsCost: { type: "number", minimum: 0, maximum: 1 },
                otherBenefitsCost: { type: "number", minimum: 0, maximum: 1 },
              },
            },
          },
        },
      },
      required: ["departmentId", "title", "salary", "startDate"],
    },
  },
  {
    name: "update_headcount",
    description:
      "Update an existing headcount plan entry. Canonical engine fields: title, name (individual hire name), employeeType (full_time | part_time | contractor), count (FTE — supports fractions like 0.5), salary (annual), hourlyRate (for contractors / part-time hourly), hoursPerWeek (40 = full-time baseline), startDate, endDate, departmentId, benefitsRate (legacy fallback), and parameters.benefitsBreakdown with the four fractions { statutoryEmployerContributionsCost, insuranceBenefitsCost, retirementContributionsCost, otherBenefitsCost }. parameters is deep-merged.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The headcount plan ID to update" },
        title: { type: "string", description: "New job title" },
        name: {
          type: ["string", "null"],
          description: "Individual hire name (null to clear)",
        },
        employeeType: {
          type: "string",
          enum: ["full_time", "part_time", "contractor"],
        },
        count: {
          type: "number",
          description: "FTE count, supports fractions (0.5 = half-time)",
        },
        salary: { type: "number", description: "New annual salary per person" },
        hourlyRate: {
          type: ["number", "null"],
          description: "Hourly rate for contractors or hourly part-time",
        },
        hoursPerWeek: {
          type: ["number", "null"],
          description: "Hours per week (40 = full-time baseline)",
        },
        startDate: { type: "string", description: "New start date (YYYY-MM-DD)" },
        endDate: {
          type: "string",
          description: "New end date (YYYY-MM-DD) or null to remove",
        },
        benefitsRate: { type: "number", description: "Legacy flat benefits rate (0-2)" },
        parameters: {
          type: "object",
          description:
            "Deep-merged into existing parameters. Use parameters.benefitsBreakdown to set the 4 component fractions.",
          properties: {
            benefitsBreakdown: {
              type: "object",
              properties: {
                statutoryEmployerContributionsCost: { type: "number", minimum: 0, maximum: 1 },
                insuranceBenefitsCost: { type: "number", minimum: 0, maximum: 1 },
                retirementContributionsCost: { type: "number", minimum: 0, maximum: 1 },
                otherBenefitsCost: { type: "number", minimum: 0, maximum: 1 },
              },
            },
          },
        },
        departmentId: { type: "string", description: "New department ID" },
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
    name: "create_revenue_stream",
    description:
      "Add a revenue stream to the current scenario — supports 7 types: subscription (SaaS MRR), one_time, usage_based, services, marketplace, ecommerce, hardware. Requires startDate (ISO YYYY-MM-DD). Optional endDate (ISO YYYY-MM-DD, or null for open-ended). Parameter field names match engine canonical names: subscription={startingCustomers, monthlyPrice, newCustomersPerMonth, monthlyChurnRate, expansionRate, priceGrowthRate, pricingModel, seatsPerCustomer, tiers}; one_time={unitsPerMonth, pricePerUnit, unitGrowthRate}; usage_based={activeUsers, avgUsagePerUser, pricePerUnit, userGrowthRate, usageGrowthRate, pricingModel, tiers}; services={hoursPerMonth, hourlyRate, hoursGrowthRate, rateIncreaseRate}; marketplace={startingGmv, takeRate, gmvGrowthRate}; ecommerce={ordersPerMonth, averageOrderValue, orderGrowthRate, aovGrowthRate}; hardware={unitsPerMonth, pricePerUnit, unitGrowthRate, priceGrowthRate}. Use this for subscription, usage-based, services, marketplace, e-commerce, and hardware revenue models. For a simple account-level revenue projection, use create_forecast_line on a revenue account instead.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the revenue stream (e.g., 'SaaS Subscriptions', 'Consulting')",
        },
        type: {
          type: "string",
          enum: [
            "subscription",
            "one_time",
            "usage_based",
            "services",
            "marketplace",
            "ecommerce",
            "hardware",
          ],
          description: "Revenue type",
        },
        startDate: {
          type: "string",
          description: "ISO date YYYY-MM-DD when this revenue stream starts",
        },
        endDate: {
          type: ["string", "null"],
          description: "ISO date YYYY-MM-DD when this revenue stream ends, or null for open-ended",
        },
        parameters: {
          type: "object",
          description: "Type-specific parameters matching the engine contract (see tool description for field names per type).",
        },
      },
      required: ["name", "type", "startDate", "parameters"],
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
      "Update an existing revenue stream's name, type, start/end dates, or parameters. Parameter field names match engine canonical names: subscription={startingCustomers, monthlyPrice, newCustomersPerMonth, monthlyChurnRate, expansionRate, priceGrowthRate, pricingModel, seatsPerCustomer, tiers}; one_time={unitsPerMonth, pricePerUnit, unitGrowthRate}; usage_based={activeUsers, avgUsagePerUser, pricePerUnit, userGrowthRate, usageGrowthRate, pricingModel, tiers}; services={hoursPerMonth, hourlyRate, hoursGrowthRate, rateIncreaseRate}; marketplace={startingGmv, takeRate, gmvGrowthRate}; ecommerce={ordersPerMonth, averageOrderValue, orderGrowthRate, aovGrowthRate}; hardware={unitsPerMonth, pricePerUnit, unitGrowthRate, priceGrowthRate}.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The revenue stream ID to update" },
        name: { type: "string", description: "New name" },
        type: {
          type: "string",
          enum: [
            "subscription",
            "one_time",
            "usage_based",
            "services",
            "marketplace",
            "ecommerce",
            "hardware",
          ],
        },
        startDate: { type: "string", description: "ISO date YYYY-MM-DD" },
        endDate: {
          type: ["string", "null"],
          description: "ISO date YYYY-MM-DD, or null to clear",
        },
        parameters: {
          type: "object",
          description: "Type-specific parameters; deep-merged into existing parameters",
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
    name: "get_scenario_comparison",
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
    name: "get_metrics",
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
    name: "get_financial_statements",
    description:
      "Get the Profit & Loss statement and a cash-flow summary for the active scenario. (Balance sheet is not returned by this tool.)",
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
    name: "create_funding_round",
    description:
      "Create a new funding round (actual or projected). This is the ONLY tool that sets roundType — roundType is immutable after creation. Supports equity (pre_seed/seed/series_a/series_b/series_c_plus), safe, convertible, debt, and grant rounds. Supply round-type-specific parameters for full fidelity: equity→{shareClassId?, sharesIssued?, pricePerShare?, liquidationPreference?}; safe→{valuationCap?, discountRate?, mfn?, proRata?}; convertible→{valuationCap?, discountRate?, interestRate?, maturityDate?, conversionThreshold?}; debt→{interestRate, termMonths, repaymentSchedule?, firstPaymentDate?}; grant→{milestones:[{id,label,amount,dueDate,hitDate?}], matchRequirement?}.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Round name (e.g., 'Seed Round', 'Series A', 'SBIR Phase 1')",
        },
        roundType: {
          type: "string",
          enum: ["pre_seed", "seed", "series_a", "series_b", "series_c_plus", "safe", "convertible", "debt", "grant"],
          description: "Type of funding. Immutable after creation.",
        },
        amount: {
          type: "number",
          description: "Total round size / funding amount in base currency",
        },
        date: {
          type: "string",
          description: "Expected or actual close date (YYYY-MM-DD)",
        },
        closeDate: {
          type: "string",
          description: "Legal close date if different from expected date (YYYY-MM-DD)",
        },
        preMoneyValuation: {
          type: "number",
          description: "Pre-money valuation (optional; required for meaningful dilution modeling)",
        },
        dilutionPercent: {
          type: "number",
          description: "Dilution percentage 0–100 (e.g., 20 for 20%)",
        },
        notes: {
          type: "string",
          description: "Free-form notes about the round",
        },
        parameters: {
          type: "object",
          description: "Round-type-specific parameters. See tool description for per-type shapes.",
        },
        isProjected: {
          type: "boolean",
          description: "true = future/projected round; false = completed round",
        },
      },
      required: ["name", "roundType", "amount", "date"],
    },
  },
  {
    name: "update_funding_round",
    description:
      "Update an existing funding round's mutable fields — name, amount, date, closeDate, valuation, dilution, notes, parameters, or projected status. roundType cannot be changed after creation (use delete + recreate to change type).",
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
        amount: {
          type: "number",
          description: "New funding amount",
        },
        date: {
          type: "string",
          description: "New expected/actual date (YYYY-MM-DD)",
        },
        closeDate: {
          type: ["string", "null"],
          description: "New legal close date (YYYY-MM-DD) or null to clear",
        },
        preMoneyValuation: {
          type: ["number", "null"],
          description: "New pre-money valuation or null to clear",
        },
        dilutionPercent: {
          type: ["number", "null"],
          description: "New dilution percentage 0–100 or null to clear",
        },
        notes: {
          type: ["string", "null"],
          description: "Updated notes; null clears",
        },
        parameters: {
          type: "object",
          description: "Updated round-type-specific parameters (merged with existing)",
        },
        isProjected: {
          type: "boolean",
          description: "Mark as projected (true) or completed (false)",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_funding_round",
    description:
      "Delete a funding round and all associated investors. This also removes any scenario overrides referencing the round.",
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
    name: "create_funding_round_investor",
    description:
      "Add an investor record to an existing funding round. Tracks individual LP/investor participation within a round for cap-table detail.",
    inputSchema: {
      type: "object",
      properties: {
        fundingRoundId: {
          type: "string",
          description: "The funding round ID to attach this investor to",
        },
        name: {
          type: "string",
          description: "Investor name (person or firm)",
        },
        email: {
          type: "string",
          description: "Investor email (optional, for contact records)",
        },
        amountInvested: {
          type: "number",
          description: "Amount invested by this specific investor",
        },
      },
      required: ["fundingRoundId", "name", "amountInvested"],
    },
  },
  {
    name: "update_grant_milestone",
    description:
      "Record that a grant milestone has been achieved. Sets the hitDate on the milestone inside the grant round's parameters. Only valid for rounds with roundType='grant'.",
    inputSchema: {
      type: "object",
      properties: {
        fundingRoundId: {
          type: "string",
          description: "ID of the grant funding round containing the milestone",
        },
        milestoneId: {
          type: "string",
          description: "ID of the milestone (matches id field in the grant's milestones array)",
        },
        hitDate: {
          type: "string",
          description: "Date the milestone was hit (YYYY-MM-DD)",
        },
      },
      required: ["fundingRoundId", "milestoneId", "hitDate"],
    },
  },
  {
    name: "update_forecast_line",
    description:
      "Update an existing expense's method, parameters, dates, or metadata (vendor, notes, frequency, department, one-time/recurring flags). Use when the user says 'edit my Slack expense' or 'change the cloud spend growth rate'. Only fields supplied are patched. Method param shapes: 'fixed' { amount }; 'growth_rate' { baseAmount, monthlyGrowthRate }; 'per_unit' { units, pricePerUnit, unitGrowthRate?, priceGrowthRate? }; 'percentage_of' { sourceLineId, percentage }; 'custom_formula' { expression, variables? }.",
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
    name: "delete_forecast_line",
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
    name: "list_accounts",
    description:
      "List the company's chart of accounts (id, name, type, category). Use this to resolve an account NAME to its id before recording a transaction with record_transaction. Read-only.",
    inputSchema: { type: "object", properties: {}, required: [] },
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
    name: "get_transaction_categories",
    description:
      "Return the supplied transactions alongside the company's chart of accounts so you (the model) can suggest a category per transaction. Read-only — it does not persist categorizations.",
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
    name: "get_report_data",
    description:
      "Assemble the financial data (metrics, P&L, recent trends) needed to write an investor-facing narrative. Read-only — it returns the data; you (the model) write the narrative from it.",
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
    name: "get_expense_analysis",
    description:
      "Assemble the company's expense breakdown, burn, and runway so you (the model) can identify cost-reduction opportunities. Read-only — it returns data for analysis and does not change anything.",
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
    name: "get_metric_benchmarks",
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
    name: "get_dilution_projection",
    description:
      "Model equity dilution from a hypothetical funding round — shows pre/post ownership percentages, option pool impact, and effective valuation. Read-only calculation; does not create a round.",
    inputSchema: {
      type: "object",
      properties: {
        roundAmount: {
          type: "number",
          description: "Amount to raise in this round",
        },
        preMoneyValuation: {
          type: "number",
          description: "Pre-money valuation for this round",
        },
        existingOwnershipPercent: {
          type: "number",
          description: "Founder/team current ownership as a percentage 0–100 (e.g., 80 for 80%). Required for meaningful dilution output.",
        },
        optionPoolPercent: {
          type: "number",
          description: "New option pool to create as a percent of post-money 0–100 (e.g., 10 for 10%). Defaults to 0 if omitted.",
        },
        existingRounds: {
          type: "array",
          items: { type: "object" },
          description: "Previous funding rounds for additional cap-table context (informational only)",
        },
      },
      required: ["roundAmount", "preMoneyValuation", "existingOwnershipPercent"],
    },
  },
  {
    name: "search_web",
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
    name: "create_salary_change",
    description:
      "Add a salary change record for an existing headcount entry. The change takes effect on `effectiveDate` and persists until superseded by a later change. Use this for raises, promotions, or compensation revisions instead of mutating headcount.salary directly.",
    inputSchema: {
      type: "object",
      properties: {
        headcountId: { type: "string" },
        effectiveDate: { type: "string", description: "ISO YYYY-MM-DD" },
        newSalary: { type: "number", description: "New annual salary" },
        reason: {
          type: "string",
          description: "Optional reason (raise, promotion, market adjustment)",
        },
      },
      required: ["headcountId", "effectiveDate", "newSalary"],
    },
  },
  {
    name: "create_bonus",
    description:
      "Add a one-time bonus payout for an existing headcount entry. Bonuses emit in the `payoutMonth` exactly — not prorated, not recurring. Multiple bonuses in the same month sum.",
    inputSchema: {
      type: "object",
      properties: {
        headcountId: { type: "string" },
        payoutMonth: { type: "string", description: "YYYY-MM (month of payout)" },
        amount: { type: "number", description: "Bonus amount in company currency" },
        type: {
          type: "string",
          enum: ["signing", "performance", "retention", "other"],
          description: "Bonus type (default performance)",
        },
        notes: { type: "string", description: "Optional notes" },
      },
      required: ["headcountId", "payoutMonth", "amount"],
    },
  },
  {
    name: "create_equity_grant",
    description:
      "Add an equity grant for an existing headcount entry. Vesting schedule is a list of milestones (cliff, monthly, quarterly, annual, or milestone) with date and shares vested. Sum of vested shares should not exceed total shares granted.",
    inputSchema: {
      type: "object",
      properties: {
        headcountId: { type: "string" },
        grantDate: { type: "string", description: "ISO YYYY-MM-DD" },
        shares: { type: "number", description: "Total shares granted (must be positive)" },
        strikePrice: {
          type: "number",
          description: "Strike price per share (null for RSUs)",
        },
        grantType: {
          type: "string",
          enum: ["iso", "nso", "rsu"],
          description: "Grant type (default iso)",
        },
        vestingSchedule: {
          type: "array",
          description: "List of vesting milestones",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["cliff", "monthly", "quarterly", "annual", "milestone"],
              },
              date: { type: "string", description: "ISO YYYY-MM-DD" },
              sharesVested: { type: "number", minimum: 0 },
            },
            required: ["type", "date", "sharesVested"],
          },
        },
      },
      required: ["headcountId", "grantDate", "shares"],
    },
  },
  {
    name: "get_revenue_projection",
    description:
      "Read-only: statistically project (extrapolate) future revenue for the active scenario from historical trends, with optional confidence intervals. Does NOT modify any data. Supports linear, exponential, conservative, and auto growth models. To CHANGE the revenue model, use create_revenue_stream or create_forecast_line.",
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
  {
    name: "read_webpage",
    description: "Fetch the readable markdown content of a SINGLE webpage by URL (e.g. a pricing, about, or docs page). This reads one page — it does not crawl a site.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL of the webpage to crawl.",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "read_webpage_rendered",
    description: "Use Cloudflare Browser Rendering to load a page and extract text. Use this ONLY as a last resort fallback when read_webpage is blocked by Cloudflare/anti-bot protection.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL of the webpage to open in the browser.",
        },
      },
      required: ["url"],
    },
  },
  ...GENUI_DISPLAY_TOOLS,
  ...GENUI_INPUT_TOOLS,
];

/**
 * Get tool definitions in provider-agnostic format.
 * Each provider maps these to its own SDK format internally.
 */
export function getFinancialTools(): ToolDefinition[] {
  return FINANCIAL_TOOLS;
}

/**
 * Tools NOT exposed over the remote MCP server (expose spec §4.4):
 * - genui show_x/request_x — render only inside our chat UI;
 * - propose_plan — a chat-loop gating construct;
 * - search_web / read_webpage / read_webpage_rendered — agents bring their
 *   own web access; keeps SearXNG/Crawl4AI off the external surface.
 * Genui names are DERIVED from the genui arrays so new genui tools are
 * excluded automatically. Guarded by __tests__/mcp-exposed-tools.test.ts.
 */
export const MCP_SERVER_EXCLUDED_TOOLS: ReadonlySet<string> = new Set<string>([
  ...GENUI_DISPLAY_TOOLS.map((t) => t.name),
  ...GENUI_INPUT_TOOLS.map((t) => t.name),
  "propose_plan",
  "search_web",
  "read_webpage",
  "read_webpage_rendered",
]);

/** The remote MCP server's tool surface: the full Companion mirror minus the
 *  exclusion set. Same names, same JSON schemas (spec B1). */
export function getMcpExposedTools(): ToolDefinition[] {
  return FINANCIAL_TOOLS.filter((t) => !MCP_SERVER_EXCLUDED_TOOLS.has(t.name));
}

/**
 * @deprecated Use getFinancialTools() instead. Kept for backward compatibility.
 * Will be removed in the next major version.
 */
export const financialTools = FINANCIAL_TOOLS;
